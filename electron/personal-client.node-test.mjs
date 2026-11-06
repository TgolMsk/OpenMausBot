import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { personalRendererArguments, personalServiceUrl } from "./personal-client.mjs";

test("legacy official broker and phone URLs cannot reactivate hosted services while own endpoints remain available", () => {
  for (const endpoint of ["https://accounts.openmausbot.com", "https://www.openmausbot.com/api", "https://openmausbot.com", "https://openmausbot-composio.milindsoni201.workers.dev/", " https://ACCOUNTS.OPENMAUSBOT.COM/ "]) {
    assert.equal(personalServiceUrl(endpoint), "");
  }
  assert.equal(personalServiceUrl("https://broker.example.test/"), "https://broker.example.test/");
  assert.equal(personalServiceUrl("http://127.0.0.1:8787"), "http://127.0.0.1:8787");
});

test("personal desktop pages have local controls without commercial account or checkout bridges", async () => {
  let bridge;
  const invocations = [];
  vm.runInNewContext(readFileSync(new URL("./preload.cjs", import.meta.url), "utf8"), {
    process: { platform: "darwin", argv: [...personalRendererArguments(), "--omb-company-desktop=1"] },
    require: () => ({
      contextBridge: { exposeInMainWorld: (_name, value) => { bridge = value; } },
      webUtils: { getPathForFile: () => "" },
      ipcRenderer: {
        on() {}, removeListener() {}, send() {},
        invoke: (...args) => { invocations.push(args); return Promise.resolve(); },
      },
    }),
  });
  for (const key of ["cloudAccount", "cloudAdd", "cloudPlan", "cloudSendPage", "accounts", "accountSheet", "companionAccount", "organization", "companyBackups", "updatesConsent"]) {
    assert.equal(bridge[key], undefined, `${key} should not be offered by a personal desktop`);
  }
  assert.deepEqual(Object.keys(bridge.updater).sort(), ["check", "install", "onState", "seen"]);
  await bridge.updater.check();
  await bridge.environments.create("Work", "/tmp/personal-test-workspace");
  await bridge.remoteClient.pair("https://own-server.example.test", "123456");
  await bridge.companion.refreshTailscale();
  assert.deepEqual(invocations, [
    ["update:check"],
    ["environments:create", "Work", "/tmp/personal-test-workspace"],
    ["desktop-remote:pair", "https://own-server.example.test", "123456"],
    ["companion:refresh-tailscale"],
  ]);
});
