import { afterEach, describe, expect, it, vi } from "vitest";
import { boatAccount, boatConfigured, boatFetch, verifyToken } from "./boat.ts";
import { BUNDLED_CLOUD_DESKTOPS_DISABLED } from "./personal-client.ts";
import { personalVpsRoutineReadiness } from "./host/vps-routine.ts";

afterEach(() => vi.restoreAllMocks());

describe("personal client cloud computer boundary", () => {
  it("does not reactivate Boat from a saved key", () => {
    const cfg = { box: { token: "boat_saved_fixture_key" } };
    expect(boatAccount(cfg)).toBeNull();
    expect(boatConfigured(cfg)).toBe(false);
  });

  it("blocks both runtime API calls and key checks before contacting Boat", async () => {
    const remote = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network request"));
    await expect(boatFetch({ box: { token: "boat_saved_fixture_key" } }, "/sandboxes", { method: "POST" })).rejects.toMatchObject({ status: 410, message: BUNDLED_CLOUD_DESKTOPS_DISABLED });
    await expect(verifyToken("boat_saved_fixture_key")).resolves.toMatchObject({ ok: false, message: BUNDLED_CLOUD_DESKTOPS_DISABLED });
    expect(remote).not.toHaveBeenCalled();
  });

  it("requires the person's own VPS for a cloud routine without contacting a bundled service", async () => {
    const remote = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network request"));
    await expect(personalVpsRoutineReadiness({}, { id: "routine-bot" })).resolves.toEqual({
      ready: false, reason: "Running on a cloud computer needs your own VPS. Configure a VPS SSH alias in Settings → Computers first.",
    });
    expect(remote).not.toHaveBeenCalled();
  });
});
