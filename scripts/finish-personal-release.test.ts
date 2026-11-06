import { expect, it, vi } from "vitest";
import { ensureInheritedMirrorDisabled, resolveReleaseTag, verifyCloudBuild, verifyReleaseTarget } from "./finish-personal-release.mjs";

const sha = "a".repeat(40);
const build = { repository: "TgolMsk/OpenMausBot", version: "0.1.145", commit: sha, macArch: "arm64", windowsArch: "x64" };

it("signs only the same-version, same-commit builds from this fork", () => {
  expect(() => verifyCloudBuild(build, build.version, sha)).not.toThrow();
  for (const patch of [{ repository: "milind-soni/OpenMausBot" }, { version: "0.1.144" }, { commit: "b".repeat(40) }, { macArch: "x64" }, { windowsArch: "arm64" }]) {
    expect(() => verifyCloudBuild({ ...build, ...patch }, build.version, sha)).toThrow();
  }
});

it("refuses a release whose tag points to another source commit", () => {
  const release = { isDraft: true, targetCommitish: sha };
  expect(() => verifyReleaseTarget(release, sha)).not.toThrow();
  expect(() => verifyReleaseTarget(release, null)).not.toThrow();
  expect(() => verifyReleaseTarget(release, undefined)).toThrow();
  expect(() => verifyReleaseTarget(release, "b".repeat(40))).toThrow("标签和云构建提交不一致");
  expect(() => verifyReleaseTarget({ ...release, isDraft: false }, sha)).toThrow("不覆盖已经发布的版本");
  expect(() => verifyReleaseTarget({ ...release, targetCommitish: "main" }, null)).toThrow("锁定具体提交");
});

it("resolves existing tags and accepts only explicit missing-ref responses", async () => {
  const command = vi.fn().mockResolvedValueOnce("{}").mockResolvedValueOnce(sha);
  await expect(resolveReleaseTag("v0.1.145", command)).resolves.toBe(sha);
  expect(command.mock.calls[1][1][1]).toContain("/commits/v0.1.145");
  const missing = Object.assign(new Error("missing"), { stderr: "gh: Not Found (HTTP 404)" });
  await expect(resolveReleaseTag("v0.1.145", vi.fn().mockRejectedValue(missing))).resolves.toBeNull();
  for (const stderr of ["gh: Bad credentials (HTTP 401)", "gh: Server Error (HTTP 500)", "TLS handshake timeout"]) {
    const error = Object.assign(new Error(stderr), { stderr });
    await expect(resolveReleaseTag("v0.1.145", vi.fn().mockRejectedValue(error))).rejects.toBe(error);
  }
});

it("does not disable an already disabled mirror workflow twice", async () => {
  const disabled = vi.fn().mockResolvedValue(JSON.stringify({ state: "disabled_manually" }));
  await expect(ensureInheritedMirrorDisabled(disabled)).resolves.toBeUndefined();
  expect(disabled).toHaveBeenCalledTimes(1);
  const active = vi.fn().mockResolvedValueOnce(JSON.stringify({ state: "active" })).mockResolvedValueOnce("").mockResolvedValueOnce(JSON.stringify({ state: "disabled_manually" }));
  await expect(ensureInheritedMirrorDisabled(active)).resolves.toBeUndefined();
  expect(active.mock.calls[1][1]).toContain("PUT");
  const unchanged = vi.fn().mockResolvedValue(JSON.stringify({ state: "active" }));
  await expect(ensureInheritedMirrorDisabled(unchanged)).rejects.toThrow("必须停用");
  const denied = Object.assign(new Error("denied"), { stderr: "gh: Forbidden (HTTP 403)" });
  await expect(ensureInheritedMirrorDisabled(vi.fn().mockRejectedValue(denied))).rejects.toBe(denied);
});
