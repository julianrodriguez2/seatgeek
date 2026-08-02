import { describe, expect, it } from "vitest";
import { evaluatePrice } from "../src/monitor.js";
import { EMPTY_STATE, type MonitorState } from "../src/state.js";

const now = new Date("2026-08-02T12:00:00.000Z");

describe("evaluatePrice", () => {
  it("alerts once when a qualifying price first appears", () => {
    const result = evaluatePrice(EMPTY_STATE, 600, 600, now);
    expect(result.reason).toBe("new-qualifying-price");
    expect(result.nextState.wasQualifying).toBe(true);
  });

  it("alerts for a price drop but not for an unchanged price", () => {
    const state: MonitorState = { version: 1, lastPrice: 590, wasQualifying: true, updatedAt: "2026-08-02T11:00:00.000Z" };
    expect(evaluatePrice(state, 580, 600, now).reason).toBe("price-drop");
    const unchanged = evaluatePrice(state, 590, 600, now);
    expect(unchanged.reason).toBeNull();
    expect(unchanged.nextState.updatedAt).toBe(state.updatedAt);
  });

  it("alerts when a qualifying price returns after disappearing", () => {
    const unavailable: MonitorState = { version: 1, lastPrice: null, wasQualifying: false, updatedAt: "2026-08-02T11:00:00.000Z" };
    expect(evaluatePrice(unavailable, 599, 600, now).reason).toBe("price-returned");
  });
});
