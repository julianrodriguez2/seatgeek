import type { MonitorState } from "./state.js";

export type AlertReason = "new-qualifying-price" | "price-drop" | "price-returned";

export interface AlertDecision {
  readonly reason: AlertReason | null;
  readonly nextState: MonitorState;
}

export function evaluatePrice(
  previous: MonitorState,
  currentPrice: number | null,
  maxPrice: number,
  now: Date
): AlertDecision {
  const qualifying = currentPrice !== null && currentPrice <= maxPrice;
  let reason: AlertReason | null = null;

  if (qualifying) {
    if (!previous.wasQualifying) {
      reason = previous.updatedAt ? "price-returned" : "new-qualifying-price";
    } else if (previous.lastPrice !== null && currentPrice < previous.lastPrice) {
      reason = "price-drop";
    }
  }

  const changed = previous.lastPrice !== currentPrice ||
    previous.wasQualifying !== qualifying || previous.updatedAt === "";

  return {
    reason,
    nextState: {
      version: 1,
      lastPrice: currentPrice,
      wasQualifying: qualifying,
      updatedAt: changed ? now.toISOString() : previous.updatedAt
    }
  };
}
