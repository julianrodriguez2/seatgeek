export const SEATGEEK_API_BASE_URL = "https://api.seatgeek.com/2";
export const REQUEST_TIMEOUT_MS = 10_000;

export interface SeatGeekVenue {
  readonly name?: string | null;
  readonly display_location?: string | null;
}

export interface SeatGeekStats {
  readonly lowest_price?: number | null;
  readonly currency?: string | null;
}

export interface SeatGeekEvent {
  readonly id: number;
  readonly title?: string | null;
  readonly datetime_local?: string | null;
  readonly datetime_utc?: string | null;
  readonly url?: string | null;
  readonly currency?: string | null;
  readonly venue?: SeatGeekVenue | null;
  readonly stats?: SeatGeekStats | null;
}

export class SeatGeekHttpError extends Error {
  public constructor(
    public readonly status: number,
    public readonly retryAfterMs?: number
  ) {
    super(`SeatGeek API request failed with HTTP ${status}.`);
    this.name = "SeatGeekHttpError";
  }
}

function retryAfterMilliseconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : undefined;
}

function isSeatGeekEvent(value: unknown): value is SeatGeekEvent {
  return typeof value === "object" && value !== null &&
    "id" in value && typeof (value as { id: unknown }).id === "number";
}

export async function fetchEvent(
  eventId: number,
  clientId: string,
  timeoutMs = REQUEST_TIMEOUT_MS,
  fetchFn: typeof fetch = fetch
): Promise<SeatGeekEvent> {
  const url = new URL(`${SEATGEEK_API_BASE_URL}/events/${eventId}`);
  url.searchParams.set("client_id", clientId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new SeatGeekHttpError(response.status, retryAfterMilliseconds(response.headers.get("retry-after")));
    }
    const body: unknown = await response.json();
    if (!isSeatGeekEvent(body) || body.id !== eventId) {
      throw new Error("SeatGeek API returned an invalid event payload.");
    }
    return body;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`SeatGeek API request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function getLowestUsdPrice(event: SeatGeekEvent): number | null {
  const reportedCurrency = event.stats?.currency ?? event.currency;
  if (reportedCurrency !== undefined && reportedCurrency !== null && reportedCurrency.toUpperCase() !== "USD") {
    return null;
  }
  const price = event.stats?.lowest_price;
  return typeof price === "number" && Number.isFinite(price) && price >= 0 ? price : null;
}

export function getEventUrl(event: SeatGeekEvent): string {
  return event.url ?? `https://seatgeek.com/event/${event.id}`;
}
