import { afterEach, describe, expect, it, vi } from "vitest";
import { boatAccount, boatConfigured, boatFetch, verifyToken } from "./boat.ts";

afterEach(() => vi.restoreAllMocks());

describe("personal client cloud computer boundary", () => {
  it("does not reactivate Boat from a saved key", () => {
    const cfg = { box: { token: "boat_saved_fixture_key" } };
    expect(boatAccount(cfg)).toBeNull();
    expect(boatConfigured(cfg)).toBe(false);
  });

  it("blocks both runtime API calls and key checks before contacting Boat", async () => {
    const remote = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network request"));
    await expect(boatFetch({ box: { token: "boat_saved_fixture_key" } }, "/sandboxes", { method: "POST" })).rejects.toMatchObject({ status: 410 });
    await expect(verifyToken("boat_saved_fixture_key")).resolves.toMatchObject({ ok: false, message: expect.stringContaining("disabled") });
    expect(remote).not.toHaveBeenCalled();
  });
});
