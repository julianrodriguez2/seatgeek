export interface DiscordAlert {
  readonly eventName: string;
  readonly currentPrice: number;
  readonly previousPrice: number | null;
  readonly eventDate: string;
  readonly venue: string;
  readonly timestamp: string;
  readonly eventUrl: string;
  readonly reason: string;
  readonly minimumQuantity: number;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function buildDiscordPayload(alert: DiscordAlert): { embeds: Array<Record<string, unknown>> } {
  const previous = alert.previousPrice === null ? "Not available" : formatUsd(alert.previousPrice);
  return {
    embeds: [{
      title: "SeatGeek price alert",
      color: 0x5865F2,
      url: alert.eventUrl,
      description: `**${alert.eventName}**\n${alert.reason}`,
      fields: [
        { name: "Lowest advertised price", value: formatUsd(alert.currentPrice), inline: true },
        { name: "Previous price", value: previous, inline: true },
        { name: "Minimum quantity", value: `${alert.minimumQuantity} ticket${alert.minimumQuantity === 1 ? "" : "s"}`, inline: true },
        { name: "Event date", value: alert.eventDate, inline: false },
        { name: "Venue", value: alert.venue, inline: false },
        { name: "Checked at", value: alert.timestamp, inline: false },
        { name: "Important", value: "Advertised API prices may not include fees. Confirm current availability and total price directly on SeatGeek.", inline: false }
      ],
      footer: { text: "Event-level monitoring only; no tickets are reserved or purchased." },
      timestamp: alert.timestamp
    }]
  };
}

export async function sendDiscordAlert(webhookUrl: string, alert: DiscordAlert, fetchFn: typeof fetch = fetch): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchFn(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildDiscordPayload(alert)),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Discord webhook request failed with HTTP ${response.status}.`);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Discord webhook request timed out after 10000ms.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
