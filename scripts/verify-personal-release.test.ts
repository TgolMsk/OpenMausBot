import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { stringify } from "yaml";
import { verifyPersonalFeed, verifyPersonalUpdateConfig } from "./verify-personal-release.mjs";

const temporary: string[] = [];
afterEach(() => { for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function release(platform: "mac" | "win") {
  const directory = mkdtempSync(join(tmpdir(), "personal-release-"));
  temporary.push(directory);
  const names = platform === "mac" ? ["OpenMausBot-0.1.145-arm64.zip", "OpenMausBot-0.1.145-arm64.dmg"] : ["OpenMausBot-0.1.145-setup.exe"];
  const files = names.map(name => {
    const bytes = Buffer.from(`packaged ${name}`);
    writeFileSync(join(directory, name), bytes);
    writeFileSync(join(directory, `${name}.blockmap`), "blockmap");
    return { url: name, size: bytes.length, sha512: createHash("sha512").update(bytes).digest("base64") };
  });
  const feed = { version: "0.1.145", files, path: files[0]!.url, sha512: files[0]!.sha512 };
  const metadata = platform === "mac" ? "latest-mac.yml" : "latest.yml";
  const save = () => writeFileSync(join(directory, metadata), stringify(feed));
  save();
  return { directory, platform, version: "0.1.145", feed, save };
}

it("accepts this fork and rejects the author's or token-dependent updater feed", () => {
  const feed = { provider: "github", owner: "TgolMsk", repo: "OpenMausBot" };
  expect(verifyPersonalUpdateConfig(stringify(feed))).toEqual(feed);
  expect(() => verifyPersonalUpdateConfig(stringify({ ...feed, owner: "milind-soni" }))).toThrow("this fork");
  expect(() => verifyPersonalUpdateConfig(stringify({ ...feed, private: true }))).toThrow("GitHub token");
});

it("checks both update manifests against their actual artifact bytes", () => {
  for (const platform of ["mac", "win"] as const) expect(verifyPersonalFeed(release(platform)).version).toBe("0.1.145");
});

it("rejects stale hashes, a mixed version and a missing NSIS installer", () => {
  const data = release("win");
  writeFileSync(join(data.directory, data.feed.files[0]!.url), "rewritten installer");
  expect(() => verifyPersonalFeed(data)).toThrow("stale sha512");
  const mixed = release("mac");
  expect(() => verifyPersonalFeed({ ...mixed, version: "0.1.146" })).toThrow("must match");
});

it("rejects a traversal or external URL in a manifest before opening it", () => {
  const data = release("mac");
  for (const name of ["../installer.zip", "https://example.com/installer.zip", "installer%2f.zip"]) {
    data.feed.files[0]!.url = name;
    data.save();
    expect(() => verifyPersonalFeed(data)).toThrow();
  }
});
