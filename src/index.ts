import { loadConfig, type Config } from "./config.js";
import { pathToFileURL } from "node:url";
import { sendDiscordAlert } from "./discord.js";
import { evaluatePrice } from "./monitor.js";
import { fetchEvent, getEventUrl, getLowestUsdPrice, SeatGeekHttpError, type SeatGeekEvent } from "./seatgeek.js";
import { readState, writeState } from "./state.js";

const MAX_ATTEMPTS = 4;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

function log(level: "info" | "warn" | "error", message: string, attributes: Record<string, unknown> = {}): void {
  console[level](JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...attributes }));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isTemporaryError(error: unknown): boolean {
  if (error instanceof SeatGeekHttpError) {
    return error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
  }
  return error instanceof TypeError || (error instanceof Error && error.message.includes("timed out"));
}

async function fetchEventWithRetry(config: Config): Promise<SeatGeekEvent> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await fetchEvent(config.eventId, config.seatGeekClientId);
    } catch (error) {
      if (!isTemporaryError(error) || attempt === MAX_ATTEMPTS) throw error;
      const exponentialDelay = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS);
      const retryAfter = error instanceof SeatGeekHttpError ? error.retryAfterMs : undefined;
      const waitMs = error instanceof SeatGeekHttpError && error.status === 429 && retryAfter !== undefined
        ? Math.max(retryAfter, exponentialDelay)
        : exponentialDelay;
      log("warn", "Temporary SeatGeek API error; retrying.", {
        eventId: config.eventId,
        attempt,
        maxAttempts: MAX_ATTEMPTS,
        status: error instanceof SeatGeekHttpError ? error.status : undefined,
        retryInMs: waitMs
      });
      await delay(waitMs);
    }
  }
  throw new Error("SeatGeek retry loop ended unexpectedly.");
}

function eventDate(event: SeatGeekEvent): string {
  return event.datetime_local ?? event.datetime_utc ?? "Not provided by SeatGeek";
}

function venue(event: SeatGeekEvent): string {
  const values = [event.venue?.name, event.venue?.display_location]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  return values.length > 0 ? values.join(" — ") : "Not provided by SeatGeek";
}

function alertReason(reason: string): string {
  switch (reason) {
    case "price-drop": return "The lowest advertised price dropped since the previous check.";
    case "price-returned": return "A qualifying advertised price is available again.";
    default: return "A qualifying advertised price is now available.";
  }
}

export async function runSingleCheck(config: Config): Promise<void> {
  const event = await fetchEventWithRetry(config);
  const price = getLowestUsdPrice(event);
  const state = await readState(config.stateFile);
  const now = new Date();
  const decision = evaluatePrice(state, price, config.maxPrice, now);

  if (price === null) {
    log("info", "No comparable USD lowest price was available in SeatGeek stats.", { eventId: config.eventId });
  } else {
    log("info", "SeatGeek event price checked.", { eventId: config.eventId, lowestPriceUsd: price, maxPriceUsd: config.maxPrice, minimumQuantity: config.minimumQuantity });
  }

  if (decision.reason === null || price === null) {
    await writeState(config.stateFile, decision.nextState);
    return;
  }

  await sendDiscordAlert(config.discordWebhookUrl, {
    eventName: event.title ?? `SeatGeek event ${event.id}`,
    currentPrice: price,
    previousPrice: state.lastPrice,
    eventDate: eventDate(event),
    venue: venue(event),
    timestamp: now.toISOString(),
    eventUrl: getEventUrl(event),
    reason: alertReason(decision.reason),
    minimumQuantity: config.minimumQuantity
  });
  await writeState(config.stateFile, decision.nextState);
  log("info", "Discord price alert sent.", { eventId: config.eventId, lowestPriceUsd: price, reason: decision.reason });
}

async function run(): Promise<void> {
  const config = loadConfig();
  let stopping = false;
  let wakeWaiter: (() => void) | undefined;
  const stop = (signal: string): void => {
    if (stopping) return;
    stopping = true;
    log("info", "Graceful shutdown requested; no further polls will start.", { signal });
    wakeWaiter?.();
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));

  log("info", "SeatGeek monitor started.", {
    eventId: config.eventId,
    maxPriceUsd: config.maxPrice,
    minimumQuantity: config.minimumQuantity,
    pollIntervalMs: config.pollIntervalMs
  });

  while (!stopping) {
    try {
      await runSingleCheck(config);
    } catch (error) {
      log("error", "Polling cycle failed.", {
        eventId: config.eventId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    if (stopping) break;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, config.pollIntervalMs);
      wakeWaiter = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    wakeWaiter = undefined;
  }
  log("info", "SeatGeek monitor stopped.", { eventId: config.eventId });
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  void run().catch((error: unknown) => {
    log("error", "Monitor could not start.", { error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  });
}
