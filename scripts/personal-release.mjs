import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { finishPersonalRelease, releaseCommand } from "./finish-personal-release.mjs";
import { RELEASE_REPOSITORY } from "./verify-personal-release.mjs";

const branch = "codex/personal-client";
const root = fileURLToPath(new URL("../", import.meta.url));
const { version } = JSON.parse(await readFile(`${root}package.json`, "utf8"));
assert.equal(await releaseCommand("git", ["branch", "--show-current"]), branch, `请在 ${branch} 分支发版`);
assert.equal(await releaseCommand("git", ["status", "--porcelain"]), "", "请先提交并推送工作区改动");
const sha = await releaseCommand("git", ["rev-parse", "HEAD"]);
assert.equal(await releaseCommand("git", ["rev-parse", `origin/${branch}`]), sha, "请先推送当前提交");
let draft;
try { draft = JSON.parse(await releaseCommand("gh", ["release", "view", `v${version}`, "--repo", RELEASE_REPOSITORY, "--json", "isDraft"])); }
catch (error) { if (!/release not found|not found|404/i.test(error.message)) throw error; }
if (draft) assert.equal(draft.isDraft, true, "该版本已发布，请先修改 package.json 版本号并提交");
else {
  const started = new Date().toISOString();
  console.log(`启动 GitHub 云构建：${version} (${sha.slice(0, 9)})`);
  await releaseCommand("gh", ["workflow", "run", "release.yml", "--repo", RELEASE_REPOSITORY, "--ref", branch, "-f", `ref=${sha}`, "-f", "publish=false"]);
  let run;
  for (let attempt = 0; attempt < 30 && !run; attempt++) {
    const runs = JSON.parse(await releaseCommand("gh", ["run", "list", "--repo", RELEASE_REPOSITORY, "--workflow", "release.yml", "--branch", branch, "--limit", "10", "--json", "databaseId,headSha,createdAt,event,url"]));
    run = runs.find(item => item.headSha === sha && item.event === "workflow_dispatch" && Date.parse(item.createdAt) >= Date.parse(started) - 1_000);
    if (!run) await new Promise(resolve => setTimeout(resolve, 2_000));
  }
  assert(run, "GitHub 未返回新构建记录，请检查 Actions 页面");
  console.log(`云构建：${run.url}`);
  await releaseCommand("gh", ["run", "watch", String(run.databaseId), "--repo", RELEASE_REPOSITORY, "--exit-status", "--interval", "15"]);
}
await finishPersonalRelease({ version, publish: true });
