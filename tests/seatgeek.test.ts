import { describe, expect, it } from "vitest";
import { getLowestUsdPrice, type SeatGeekEvent } from "../src/seatgeek.js";

describe("getLowestUsdPrice", () => {
  it("accepts a valid lowest price in USD", () => {
    const event: SeatGeekEvent = { id: 18390890, currency: "USD", stats: { lowest_price: 575 } };
    expect(getLowestUsdPrice(event)).toBe(575);
  });

  it("does not compare a non-USD price or a missing price", () => {
    expect(getLowestUsdPrice({ id: 1, currency: "CAD", stats: { lowest_price: 500 } })).toBeNull();
    expect(getLowestUsdPrice({ id: 1, stats: { lowest_price: null } })).toBeNull();
  });
});
