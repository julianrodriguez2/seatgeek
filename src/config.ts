import "dotenv/config";

export interface Config {
  readonly seatGeekClientId: string;
  readonly discordWebhookUrl: string;
  readonly eventId: number;
  readonly maxPrice: number;
  readonly pollIntervalMs: number;
  readonly minimumQuantity: 1;
  readonly stateFile: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function positiveNumber(name: string, fallback?: string): number {
  const raw = process.env[name]?.trim() || fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return value;
}

function validWebhook(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DISCORD_WEBHOOK_URL must be a valid HTTPS URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("DISCORD_WEBHOOK_URL must use HTTPS.");
  }
  return parsed.toString();
}

export function loadConfig(): Config {
  const eventId = positiveNumber("EVENT_ID", "18390890");
  if (!Number.isInteger(eventId)) {
    throw new Error("EVENT_ID must be an integer.");
  }
  return {
    seatGeekClientId: required("SEATGEEK_CLIENT_ID"),
    discordWebhookUrl: validWebhook(required("DISCORD_WEBHOOK_URL")),
    eventId,
    maxPrice: positiveNumber("MAX_PRICE", "600"),
    pollIntervalMs: positiveNumber("POLL_INTERVAL_SECONDS", "60") * 1_000,
    minimumQuantity: 1,
    stateFile: process.env.STATE_FILE?.trim() || "data/seatgeek-state.json"
  };
}
