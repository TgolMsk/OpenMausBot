import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { verifyPersonalFeed, verifyPersonalUpdateConfig, RELEASE_REPOSITORY } from "./verify-personal-release.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const execute = promisify(execFile);
const require = createRequire(import.meta.url);

export async function releaseCommand(command, args, options = {}) {
  const { stdout } = await execute(command, args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, ...options });
  return stdout.trim();
}

export function verifyCloudBuild(metadata, version, sha) {
  assert.equal(metadata.repository, RELEASE_REPOSITORY, "云构建必须来自当前 fork");
  assert.equal(metadata.version, version, "云构建版本不匹配");
  assert.equal(metadata.commit, sha, "云构建提交不匹配");
  assert.equal(metadata.macArch, "arm64", "Mac 安装包必须为 Apple silicon");
  assert.equal(metadata.windowsArch, "x64", "Windows 安装包必须为 x64");
}

export function verifyReleaseTarget(release, tagSha) {
  assert.equal(release.isDraft, true, "只处理草稿，不覆盖已经发布的版本");
  assert.match(release.targetCommitish, /^[a-f0-9]{40}$/, "草稿必须锁定具体提交");
  if (tagSha !== null) assert.equal(tagSha, release.targetCommitish, "Release 标签和云构建提交不一致");
}

export async function resolveReleaseTag(tag, command = releaseCommand) {
  try {
    await command("gh", ["api", `repos/${RELEASE_REPOSITORY}/git/ref/tags/${tag}`]);
  } catch (error) {
    if (error.stderr?.includes("(HTTP 404)")) return null;
    throw error;
  }
  return command("gh", ["api", `repos/${RELEASE_REPOSITORY}/commits/${tag}`, "--jq", ".sha"]);
}

async function notarize(file, profile, directory) {
  console.log(`正在公证：${basename(file)}`);
  const result = JSON.parse(await releaseCommand("xcrun", ["notarytool", "submit", file, "--keychain-profile", profile, "--wait", "--output-format", "json"]));
  await writeFile(join(directory, `${basename(file)}.notary.json`), JSON.stringify(result, null, 2));
  if (result.status !== "Accepted") {
    throw new Error(`Apple 未接受 ${basename(file)}，公证记录 ${result.id}，详情保存在 ${directory}`);
  }
  return result.id;
}

async function staple(file) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      await releaseCommand("xcrun", ["stapler", "staple", file]);
      await releaseCommand("xcrun", ["stapler", "validate", file]);
      return;
    } catch (error) {
      if (attempt === 6) throw error;
      console.log(`等待公证票据：${basename(file)} (${attempt}/6)`);
      await new Promise(resolve => setTimeout(resolve, 30_000));
    }
  }
}

export async function finishPersonalRelease({ version, profile = "fgbrowser-notary", identity, publish = false }) {
  assert.equal(process.platform, "darwin", "Mac 签名与公证需在 macOS 上完成");
  assert.match(version, /^\d+\.\d+\.\d+$/, "版本必须为 X.Y.Z");
  const tag = `v${version}`;
  const release = JSON.parse(await releaseCommand("gh", ["release", "view", tag, "--repo", RELEASE_REPOSITORY, "--json", "isDraft,targetCommitish,url,body"]));
  const tagSha = await resolveReleaseTag(tag);
  verifyReleaseTarget(release, tagSha);
  await releaseCommand("git", ["merge-base", "--is-ancestor", release.targetCommitish, "origin/codex/personal-client"]);

  const identities = await releaseCommand("/usr/bin/security", ["find-identity", "-v", "-p", "codesigning"]);
  identity ??= identities.match(/"(Developer ID Application: [^"\n]+)"/)?.[1];
  assert(identity?.startsWith("Developer ID Application:"), "没有可用的 Developer ID Application 签名证书");
  assert(identities.includes(`"${identity}"`), "所选签名证书不在本机钥匙串中");
  const team = identity.match(/\(([A-Z0-9]+)\)$/)?.[1];
  assert(team, "签名证书必须包含 Apple Team ID");

  const directory = join(root, ".omb-scratch", "releases", tag);
  const assets = join(directory, "assets");
  const unpacked = join(directory, "unpacked");
  await mkdir(assets, { recursive: true });
  await rm(unpacked, { recursive: true, force: true });
  await mkdir(unpacked, { recursive: true });
  console.log(`下载云端构建：${RELEASE_REPOSITORY} ${tag}`);
  await releaseCommand("gh", ["release", "download", tag, "--repo", RELEASE_REPOSITORY, "--dir", assets, "--clobber"]);
  const metadata = JSON.parse(await readFile(join(assets, "build-metadata.json"), "utf8"));
  verifyCloudBuild(metadata, version, release.targetCommitish);
  verifyPersonalFeed({ directory: assets, platform: "mac", version });
  verifyPersonalFeed({ directory: assets, platform: "win", version });
  const zip = join(assets, `OpenMausBot-${version}-arm64.zip`);
  const dmg = join(assets, `OpenMausBot-${version}-arm64.dmg`);
  await releaseCommand("/usr/bin/ditto", ["-x", "-k", zip, unpacked]);
  const app = join(unpacked, "OpenMausBot.app");
  const plist = join(app, "Contents", "Info.plist");
  assert.equal(await releaseCommand("/usr/libexec/PlistBuddy", ["-c", "Print CFBundleShortVersionString", plist]), version);
  verifyPersonalUpdateConfig(await readFile(join(app, "Contents", "Resources", "app-update.yml"), "utf8"));
  const builder = createRequire(require.resolve("electron-builder"));
  const appBuilder = createRequire(builder.resolve("app-builder-lib"));
  const { signAsync } = appBuilder("@electron/osx-sign");
  console.log(`正在签名 Mac 应用，Team ID：${team}`);
  await signAsync({ app, identity, platform: "darwin", type: "distribution", preAutoEntitlements: false, preEmbedProvisioningProfile: false,
    strictVerify: true, optionsForFile: () => ({ entitlements: join(root, "build", "entitlements.mac.plist"), hardenedRuntime: true }) });
  await releaseCommand("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
  const notaryZip = join(directory, "notary-app.zip");
  await rm(notaryZip, { force: true });
  await releaseCommand("/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, notaryZip]);
  const appNotary = await notarize(notaryZip, profile, directory);
  await staple(app);
  await releaseCommand("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=2", app]);
  await rm(zip, { force: true });
  await releaseCommand("/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, zip]);
  await symlink("/Applications", join(unpacked, "Applications"));
  await releaseCommand("/usr/bin/hdiutil", ["create", "-volname", "OpenMausBot", "-srcfolder", unpacked, "-ov", "-format", "UDZO", dmg]);
  await releaseCommand("/usr/bin/codesign", ["--force", "--sign", identity, "--timestamp", dmg]);
  const dmgNotary = await notarize(dmg, profile, directory);
  await staple(dmg);
  await releaseCommand(process.execPath, ["scripts/regenerate-blockmaps.mjs", zip, dmg]);
  await releaseCommand(process.execPath, ["scripts/regenerate-mac-feed.mjs", join(assets, "latest-mac.yml")]);
  const verified = ["mac", "win"].map(platform => verifyPersonalFeed({ directory: assets, platform, version }));
  const names = (await readdir(assets)).filter(name => /\.(?:zip|dmg|exe|blockmap|yml)$/.test(name)).sort();
  const sums = [];
  for (const name of names) sums.push(`${createHash("sha256").update(await readFile(join(assets, name))).digest("hex")}  ${name}`);
  await writeFile(join(assets, "SHA256SUMS.txt"), `${sums.join("\n")}\n`);
  const receipt = { version, source: release.targetCommitish, team, appNotary, dmgNotary, verified };
  await writeFile(join(assets, "mac-signing.json"), JSON.stringify(receipt, null, 2));
  await writeFile(join(assets, "build-metadata.json"), JSON.stringify({ ...metadata, macSigned: true, macNotarized: true, signingTeam: team }, null, 2));
  const upload = [zip, `${zip}.blockmap`, dmg, `${dmg}.blockmap`, join(assets, "latest-mac.yml"), join(assets, "SHA256SUMS.txt"), join(assets, "mac-signing.json"), join(assets, "build-metadata.json")];
  console.log("上传已签名、公证的 Mac 安装包与更新元数据");
  await releaseCommand("gh", ["release", "upload", tag, "--repo", RELEASE_REPOSITORY, ...upload, "--clobber"]);
  const remote = JSON.parse(await releaseCommand("gh", ["release", "view", tag, "--repo", RELEASE_REPOSITORY, "--json", "assets"]));
  for (const file of upload) {
    const local = await readFile(file);
    const uploaded = remote.assets.find(asset => asset.name === basename(file));
    assert.equal(uploaded?.size, local.length, `远端文件大小不符：${basename(file)}`);
    if (uploaded.digest) assert.equal(uploaded.digest, `sha256:${createHash("sha256").update(local).digest("hex")}`);
  }
  if (publish) {
    const current = JSON.parse(await releaseCommand("gh", ["release", "view", tag, "--repo", RELEASE_REPOSITORY, "--json", "isDraft,targetCommitish"]));
    verifyReleaseTarget(current, await resolveReleaseTag(tag));
    assert.equal(current.targetCommitish, release.targetCommitish, "签名期间草稿源提交发生变化");
    await releaseCommand("gh", ["api", "--method", "PUT", `repos/${RELEASE_REPOSITORY}/actions/workflows/sync-published-release.yml/disable`]);
    const notes = join(directory, "release-notes.md");
    await writeFile(notes, `自用客户端 ${version}\n\n- macOS Apple silicon：Developer ID 签名、Apple 公证。\n- Windows x64：NSIS 安装包与 ZIP。\n- 自动更新仅连接本仓库正式 Releases。\n\n构建提交：${release.targetCommitish}\n云构建：${metadata.run}\n`);
    await releaseCommand("gh", ["release", "edit", tag, "--repo", RELEASE_REPOSITORY, "--notes-file", notes, "--draft=false", "--latest"]);
    let publishedSha = null;
    for (let attempt = 0; attempt < 3 && publishedSha === null; attempt++) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, 3000));
      publishedSha = await resolveReleaseTag(tag);
    }
    assert.equal(publishedSha, release.targetCommitish, "已发布标签和云构建提交不一致");
    console.log(`已发布：https://github.com/${RELEASE_REPOSITORY}/releases/tag/${tag}`);
  } else console.log(`签名产物已更新到草稿 ${tag}`);
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { version: { type: "string" }, profile: { type: "string", default: "fgbrowser-notary" }, identity: { type: "string" }, publish: { type: "boolean", default: false } } });
  const version = values.version ?? JSON.parse(await readFile(join(root, "package.json"), "utf8")).version;
  await finishPersonalRelease({ version, profile: values.profile, identity: values.identity, publish: values.publish });
}
