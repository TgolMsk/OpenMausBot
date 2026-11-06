import { readFileSync } from "node:fs";
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
