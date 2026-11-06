import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialState, reducer } from "@/state/store";
import { setLocale } from "@/lib/i18n";
import { analyticsEnabled, initAnalytics } from "@/lib/analytics";
import { introChips, setupSteps } from "@/lib/default-bot";
import { persistedComputerSelectionMatches } from "@/lib/local-computer";
import { CloudBackendPicker } from "./CloudBackendPicker";
import { PlaceAddSheet } from "./PlaceAddSheet";
import { KeysPage } from "./keys/KeysPage";

vi.mock("@/state/store", async (original) => {
  const actual = await original<typeof import("@/state/store")>();
  return { ...actual, useStore: () => ({ state: actual.initialState, dispatch: vi.fn(), refreshInstances: vi.fn() }) };
});

beforeEach(() => {
  setLocale("en");
  vi.stubGlobal("window", { ogb: { remoteClient: { active: false } } });
});
afterEach(() => vi.unstubAllGlobals());

describe("personal client capabilities", () => {
  it("refuses purchase navigation, including deep links into Cloud settings", () => {
    expect(reducer(initialState, { type: "openCloudAdd", source: "app_settings" })).toBe(initialState);
    expect(reducer(initialState, { type: "cloudHowTo", open: true })).toBe(initialState);
    const settings = reducer(initialState, { type: "toggleAppSettings", open: true, section: "cloudAccount" });
    expect(settings.appSettingsOpen).toBe(true);
    expect(settings.appSettingsSection).toBe("general");
  });

  it("keeps useful first-run steps without offering hosted Cloud", () => {
    const fresh = { aiReady: false, ownBots: 0, onCloud: false, team: false, remote: false };
    expect(setupSteps(fresh)).toEqual(["ai", "bots", "apps", "phone"]);
    expect(introChips({ ...fresh, importFound: true })).toEqual(["ai", "apps", "import", "phone"]);
  });

  it("offers the person's VPS and accepts it as the default persisted backend", () => {
    const html = renderToStaticMarkup(createElement(CloudBackendPicker, { value: "vps", onChange: vi.fn() }));
    expect(html).toContain("Self-hosted VPS");
    expect(html).not.toContain("Boat");
    expect(persistedComputerSelectionMatches({ computer: "cloud", cloudBackend: "vps", persistedBot: { computer: "cloud" } })).toBe(true);
  });

  it("opens the own-server pairing form even if an old desktop advertises buying choices", () => {
    const html = renderToStaticMarkup(createElement(PlaceAddSheet, {
      choices: { cloud: true, link: true, address: false, account: true, organization: true },
      onClose: vi.fn(), onAccount: vi.fn(),
    }));
    expect(html).toContain('data-place-add="own-server"');
    expect(html).toContain("https://");
    expect(html).not.toContain('data-place-add-choice="cloud"');
    expect(html).not.toContain('data-place-add-choice="organization"');
  });

  it("keeps model and optional voice API settings while omitting Boat", () => {
    const html = renderToStaticMarkup(createElement(KeysPage));
    for (const key of ["openai", "anthropic", "openaiCompat", "vps", "elevenlabs", "fishAudio"]) {
      expect(html).toContain(`data-key-row="${key}"`);
    }
    expect(html).not.toContain('data-key-row="box"');
    expect(html).not.toContain("boat.dev");
  });

  it("does not start the original product's analytics", async () => {
    expect(analyticsEnabled()).toBe(false);
    await expect(initAnalytics()).resolves.toBeUndefined();
  });
});
