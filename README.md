# SeatGeek ticket monitor

A production-oriented Node.js monitor for the League of Legends Worlds SeatGeek event (`18390890`). It checks only SeatGeek's official public API and sends a Discord webhook alert for qualifying event-level advertised prices. It never scrapes SeatGeek, drives a browser, bypasses CAPTCHAs, reserves tickets, or purchases tickets.

## What it monitors

The monitor calls the official API once per configured interval:

`https://api.seatgeek.com/2/events/18390890?client_id=SEATGEEK_CLIENT_ID`

It reads `stats.lowest_price` and treats it as a USD price only. If the API reports a non-USD currency, or the price is missing, null, invalid, or unavailable, it is not compared to the configured threshold.

SeatGeek's public API generally provides event-level pricing rather than individual listing details. In particular, an event-level lowest price does not prove that a specific seat, ticket type, or quantity is still available. This monitor is configured for a minimum of one ticket, but you must confirm final availability, quantity, fees, and total price on SeatGeek.

## Setup

1. Create a SeatGeek developer application in the [SeatGeek developer portal](https://platform.seatgeek.com/). Copy the application's **client ID** (do not put a client secret in this project).
2. In Discord, open the target server and channel settings, select **Integrations** → **Webhooks**, create a webhook, and copy its webhook URL. Keep the URL private because anyone with it can post to that channel.
3. Install dependencies and make your local configuration:

   ```sh
   npm install
   cp .env.example .env
   ```

4. Edit `.env` with your SeatGeek client ID and Discord webhook URL, then start the monitor:

   ```sh
   npm run dev
   ```

Required `.env` values:

```dotenv
SEATGEEK_CLIENT_ID=your_seatgeek_client_id
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
EVENT_ID=18390890
MAX_PRICE=600
POLL_INTERVAL_SECONDS=60
```

`EVENT_ID`, `MAX_PRICE`, and `POLL_INTERVAL_SECONDS` have the displayed defaults but are validated at startup. `SEATGEEK_CLIENT_ID` and `DISCORD_WEBHOOK_URL` must be supplied.

## Alerts and state

The first time `stats.lowest_price` is at or below `$600`, the bot sends an alert. It also alerts if a qualifying price drops from the preceding check, and when a qualifying price disappears (or moves above the limit) and later comes back. It does not repeatedly alert for an unchanged qualifying price.

State is stored by default at `data/seatgeek-state.json`. It is written atomically through a temporary file and rename, so restarts preserve deduplication. Set `STATE_FILE` if you need a different location (for example, a mounted persistent disk). The state file contains no credentials.

Discord messages contain the event name, current and previous advertised price when available, event date, venue, check timestamp, and a direct SeatGeek link. They clearly warn that advertised API prices may not include fees and must be confirmed on SeatGeek.

## Commands

```sh
npm run dev        # run TypeScript in watch mode
npm run check      # run exactly one monitoring cycle
npm run build      # compile to dist/
npm start          # run compiled JavaScript
npm test           # run Vitest tests
npm run typecheck  # strict TypeScript validation
```

The monitor uses a 10-second request timeout, retries temporary network, timeout, `408`, `425`, `429`, and server errors with exponential backoff, respects a `Retry-After` value for HTTP `429`, and emits JSON-formatted console logs. `SIGINT` and `SIGTERM` stop new polling cycles cleanly.

## Docker

After creating `.env`, start it continuously with Docker Compose:

```sh
docker compose up --build -d
docker compose logs -f
```

The named `seatgeek-state` volume persists the monitor state across container rebuilds and restarts. Stop it with `docker compose down`; the state remains unless you explicitly remove the volume.

## Free GitHub Actions hosting

This repository includes `.github/workflows/seatgeek-monitor.yml` for scheduled hosting with GitHub Actions. GitHub schedules run at a minimum interval of **five minutes**, so this option intentionally cannot meet the local/Docker 60-second poll interval.

1. Push this project to a GitHub repository. A private repository is recommended because it stores monitoring state commits.
2. In the repository, open **Settings** → **Secrets and variables** → **Actions**, then add these repository secrets:
   - `SEATGEEK_CLIENT_ID`
   - `DISCORD_WEBHOOK_URL`
3. Open the **Actions** tab, select **SeatGeek monitor**, then use **Run workflow** once to validate it. It will subsequently run every five minutes.

The workflow uses a serialized job and commits `.seatgeek-state.json` back to the repository only when the price/availability state changes. The file contains no credentials. Its `GITHUB_TOKEN` needs **Read and write permissions** for repository contents; if the repository branch is protected, allow GitHub Actions to push to it or use an unprotected state branch. Do not add the two secrets to a committed `.env` file.

## Scope and safety

This bot is notification-only. It uses only the SeatGeek API and Discord's webhook endpoint; it cannot automatically buy tickets or reserve inventory. Always open the SeatGeek event page and independently verify the final price, fees, ticket quantity, and availability before taking any action.
