import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { parse } from "yaml";

const text = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
const workflow = parse(text);
type Step = { name?: string; uses?: string; run?: string; with?: Record<string, unknown> };

it("allows only explicit releases from this fork's personal branch history", () => {
  expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
  expect(workflow.on.workflow_dispatch.inputs).toHaveProperty("ref");
  expect(workflow.on.workflow_dispatch.inputs).toHaveProperty("publish");
  expect(workflow.jobs.prepare.if).toBe("github.repository == 'TgolMsk/OpenMausBot'");
  const pin = workflow.jobs.prepare.steps.find((step: Step) => step.name === "Pin and validate the source");
  expect(pin.run).toContain("git merge-base --is-ancestor HEAD origin/codex/personal-client");
  expect(text).not.toContain("milind-soni");
  expect(text).not.toContain("RELEASES_PAT");
});

it("uploads both installers, the updater manifests and blockmaps before a draft can exist", () => {
  expect(workflow.jobs.assemble.needs).toEqual(["prepare", "mac", "windows"]);
  expect(workflow.jobs.mac["runs-on"]).toBe("macos-15");
  expect(workflow.jobs.windows["runs-on"]).toBe("windows-latest");
  for (const [job, feed] of [["mac", "latest-mac.yml"], ["windows", "latest.yml"]]) {
    const steps: Step[] = workflow.jobs[job!].steps;
    const upload = steps.find(step => step.uses?.startsWith("actions/upload-artifact@"))!;
    expect(upload.with?.path).toContain(feed);
    expect(upload.with?.path).toContain("release/*.blockmap");
    expect(steps.find(step => step.name === "Verify the fork feed and installer hashes")?.run).toContain("--resources");
  }
});

it("refuses an existing version tag from another commit and fails closed on a tag lookup error", () => {
  const pin = workflow.jobs.prepare.steps.find((step: Step) => step.name === "Pin and validate the source").run as string;
  expect(pin).toContain('git ls-remote --exit-code --tags origin "refs/tags/v$version"');
  expect(pin).toContain('gh api "repos/$GITHUB_REPOSITORY/commits/v$version" --jq .sha');
  expect(pin).toContain('test "$tag_sha" = "$sha"');
  expect(pin).toContain('test "$tag_lookup_status" -eq 2');
});

it("never publishes an unsigned Mac release or writes to an upstream mirror", () => {
  const steps: Step[] = workflow.jobs.assemble.steps;
  expect(steps.find(step => step.name === "Verify the downloaded release bytes")?.run).toContain("--platform all");
  const publish = steps.find(step => step.name === "Create and upload the same-commit draft")!.run!;
  expect(publish).toContain("--draft");
  expect(publish).toContain('test "$target_sha" = "$SHA"');
  expect(publish).not.toContain("--draft=false");
  expect(publish).not.toContain("--latest");
  expect(workflow.permissions).toEqual({ contents: "read" });
  expect(workflow.jobs.assemble.permissions).toEqual({ contents: "write" });
});

it("never rewrites a complete draft and uploads the completion marker last when recovering a partial draft", () => {
  const upload = workflow.jobs.assemble.steps.find((step: Step) => step.name === "Create and upload the same-commit draft").run as string;
  const sha = "a".repeat(40);
  for (const complete of [true, false]) {
    const directory = mkdtempSync(join(tmpdir(), "personal-draft-"));
    try {
      mkdirSync(join(directory, "assets"));
      for (const file of ["OpenMausBot.dmg", "build-metadata.json", "latest-mac.yml"]) writeFileSync(join(directory, "assets", file), file);
      writeFileSync(join(directory, "existing-release.json"), JSON.stringify({
        isDraft: true, targetCommitish: sha, assets: complete ? [{ name: "build-metadata.json" }] : [],
      }));
      const mock = `gh() {
        if [ "$1" = release ] && [ "$2" = view ]; then
          cat "$RUNNER_TEMP/existing-release.json"
        elif [ "$1" = api ]; then
          printf '%s\\n' "$SHA"
        elif [ "$1" = release ] && [ "$2" = upload ]; then
          printf '%s\\n' "$4" >> "$RUNNER_TEMP/uploads.log"
        else
          return 91
        fi
      }`;
      const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", `${mock}\n${upload}`], {
        cwd: directory, encoding: "utf8", timeout: 10_000,
        env: { ...process.env, GITHUB_REPOSITORY: "TgolMsk/OpenMausBot", VERSION: "0.1.145", SHA: sha,
          RUNNER_TEMP: directory, GITHUB_STEP_SUMMARY: join(directory, "summary.md"), PUBLISH_REQUESTED: "false" },
      });
      expect(result.error).toBeUndefined();
      if (complete) {
        expect(result.status).toBe(1);
        expect(result.stdout).toContain("the draft is complete");
        expect(existsSync(join(directory, "uploads.log"))).toBe(false);
      } else {
        expect(result.status, result.stderr).toBe(0);
        expect(readFileSync(join(directory, "uploads.log"), "utf8").trim().split("\n"))
          .toEqual(["assets/OpenMausBot.dmg", "assets/latest-mac.yml", "assets/build-metadata.json"]);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});
