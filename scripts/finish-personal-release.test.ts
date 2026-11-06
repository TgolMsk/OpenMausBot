import { expect, it } from "vitest";
import { verifyCloudBuild } from "./finish-personal-release.mjs";

const sha = "a".repeat(40);
const build = { repository: "TgolMsk/OpenMausBot", version: "0.1.145", commit: sha, macArch: "arm64", windowsArch: "x64" };

it("signs only the same-version, same-commit builds from this fork", () => {
  expect(() => verifyCloudBuild(build, build.version, sha)).not.toThrow();
  for (const patch of [{ repository: "milind-soni/OpenMausBot" }, { version: "0.1.144" }, { commit: "b".repeat(40) }, { macArch: "x64" }, { windowsArch: "arm64" }]) {
    expect(() => verifyCloudBuild({ ...build, ...patch }, build.version, sha)).toThrow();
  }
});
