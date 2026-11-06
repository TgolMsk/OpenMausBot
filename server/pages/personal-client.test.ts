import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PAGE_TOOL_DEFINITIONS } from "../drivers/agents-pages-tools.ts";
import { FAKE_DESKTOP_TOKEN, FAKE_HOME, FAKE_TOKEN_URL } from "../testing/fake-pages.ts";
import { applyIncludedPagesMessage, pagesAccess, PERSONAL_PAGES_UNAVAILABLE } from "./access.ts";
import { createPublishedPages } from "./service.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("personal client page hosting", () => {
  it("does not accept official desktop or Cloud page credentials and never advertises publishing tools", () => {
    expect(applyIncludedPagesMessage({ type: "openmausbot:included-pages", access: { url: FAKE_TOKEN_URL, token: FAKE_DESKTOP_TOKEN } })).toBe(true);
    expect(pagesAccess(null)).toBeNull();
    expect(pagesAccess(FAKE_HOME)).toBeNull();
    expect(PAGE_TOOL_DEFINITIONS).toEqual([]);
  });

  it("refuses publish and unpublish before reading files, posting cards or contacting the hosted service", async () => {
    const dir = mkdtempSync(join(tmpdir(), "omb-personal-pages-"));
    dirs.push(dir);
    const remote = vi.fn<typeof fetch>();
    const post = vi.fn();
    const pages = createPublishedPages({ dataDir: dir, cloudHome: FAKE_HOME, fetch: remote, patch: vi.fn() });
    const refused = { status: 503, text: PERSONAL_PAGES_UNAVAILABLE };
    await expect(pages.publisher.publish({ botId: "bot", threadId: "thread", path: "does-not-exist", title: "Page", roots: [dir], post })).resolves.toEqual(refused);
    await expect(pages.publisher.publishFiles({ botId: "bot", threadId: "thread", source: "inline", title: "Page", files: [], post })).resolves.toEqual(refused);
    await expect(pages.publisher.unpublish({ pageId: "abcdefghijklmnopqrstuvwxyz" })).resolves.toEqual(refused);
    expect(remote).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(pages.store.list()).toEqual([]);
  });
});
