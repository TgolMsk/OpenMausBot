import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parse } from "yaml";

export const RELEASE_REPOSITORY = "TgolMsk/OpenMausBot";

export function verifyPersonalUpdateConfig(text) {
  const config = parse(text);
  assert.equal(config.provider, "github", "The updater must use GitHub Releases");
  assert.equal(`${config.owner}/${config.repo}`, RELEASE_REPOSITORY, "The updater must use this fork's release feed");
  assert.notEqual(config.private, true, "Installed clients must not need a GitHub token");
  return config;
}

export function verifyPersonalFeed({ directory, platform, version }) {
  assert.match(version, /^\d+\.\d+\.\d+$/, "A stable X.Y.Z package version is required");
  assert(["mac", "win"].includes(platform), "Choose mac or win");
  const metadata = platform === "mac" ? "latest-mac.yml" : "latest.yml";
  const feed = parse(readFileSync(join(directory, metadata), "utf8"));
  assert.equal(feed.version, version, `${metadata} must match package.json`);
  assert(Array.isArray(feed.files) && feed.files.length > 0, `${metadata} has no update artifacts`);
  const verified = new Set();
  for (const file of feed.files) {
    assert.equal(typeof file.url, "string");
    assert.equal(file.url, basename(file.url), "Feed artifacts must be local basenames");
    assert(!/[\\?#%]/.test(file.url), "Feed artifacts must not include URL or path escapes");
    const artifact = join(directory, file.url);
    assert(lstatSync(artifact).isFile() && !lstatSync(artifact).isSymbolicLink(), `${file.url} must be a regular file`);
    const bytes = readFileSync(artifact);
    assert.equal(createHash("sha512").update(bytes).digest("base64"), file.sha512, `${file.url} has a stale sha512`);
    assert.equal(bytes.length, file.size, `${file.url} has a stale size`);
    assert(existsSync(`${artifact}.blockmap`), `${file.url} is missing its updater blockmap`);
    verified.add(file.url);
  }
  if (platform === "mac") {
    assert([...verified].some(name => name.endsWith("-arm64.zip")), "Apple silicon updates require the arm64 ZIP");
    assert([...verified].some(name => name.endsWith("-arm64.dmg")), "Apple silicon installs require the arm64 DMG");
  } else {
    assert([...verified].some(name => name.endsWith("-setup.exe")), "Windows updates require the NSIS installer");
  }
  assert(verified.has(feed.path), `${metadata} has an invalid legacy path`);
  assert.equal(feed.sha512, feed.files.find(file => file.url === feed.path)?.sha512, `${metadata} has a stale legacy hash`);
  return { metadata, version, files: [...verified] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: {
    dir: { type: "string", default: "release" }, platform: { type: "string" }, version: { type: "string" }, resources: { type: "string" },
  } });
  if (values.resources) verifyPersonalUpdateConfig(readFileSync(join(values.resources, "app-update.yml"), "utf8"));
  const platforms = values.platform === "all" ? ["mac", "win"] : [values.platform];
  for (const platform of platforms) {
    const result = verifyPersonalFeed({ directory: values.dir, platform, version: values.version });
    console.log(JSON.stringify(result));
  }
}
