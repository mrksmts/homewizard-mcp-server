# homewizard-mcp-server

A read-only Model Context Protocol (MCP) server for the [HomeWizard Energy](https://www.homewizard.com/) local API. Exposes the live data your P1 smart meter publishes — instantaneous power draw, per-phase voltages and currents, cumulative kWh, gas usage, and the raw DSMR telegram — to any MCP-compatible client (Claude Desktop, Claude Code, etc.).

Supports both API v1 (HTTP, no auth) and API v2 (HTTPS, bearer token). Writes to the device — toggling cloud, blinking LEDs, anything PUT/POST — are deliberately not exposed.

## Tools

| Tool | What it does |
| --- | --- |
| `homewizard_get_device_info` | Product type, serial, firmware, API version |
| `homewizard_get_measurement` | Live power, voltages, currents, frequency, cumulative kWh, gas |
| `homewizard_get_telegram` | Raw DSMR telegram from the P1 port (text) |
| `homewizard_get_system_status` | Wi-Fi, uptime, cloud-enabled state |

## What the API can and can't tell you

The HomeWizard local API exposes **only the live state** of your smart meter:
- Instantaneous power, voltage, current, frequency
- Cumulative meter totals (kWh since the meter was installed — running odometer)

There is **no history endpoint**. The local API can't answer "what did I use today / yesterday / this week / this month / this year" — those numbers shown in the HomeWizard mobile app are computed and stored server-side in HomeWizard's cloud, which the local API does not surface.

This MCP server reflects exactly that: ask it what you're using *right now*, what your *total* meter reading is, or how *fast* power is being exported, and you'll get a precise answer. Ask it for a windowed total and the agent should answer honestly that this isn't available locally.

## Quickstart

```bash
git clone https://github.com/mrksmts/homewizard-mcp-server
cd homewizard-mcp-server
npm install        # also runs the build via the "prepare" script
```

Once the repo is on GitHub (or published to npm) you can also run it without cloning — see [Running via npx](#running-via-npx) below.

You'll need to know your device's IP or `.local` hostname. Discover it with:

```bash
dns-sd -B _hwenergy._tcp .   # API v1 (HTTP, port 80)
dns-sd -B _homewizard._tcp . # API v2 (HTTPS, port 443)
```

### Option A — API v1 (easiest)

1. Open the HomeWizard Energy app → Settings → Meters → your P1 → enable **Local API**.
2. Set `HOMEWIZARD_HOST` and run.

```bash
export HOMEWIZARD_HOST=192.168.1.26
export HOMEWIZARD_API_VERSION=v1   # default
npm start
```

### Option B — API v2 (HTTPS, token-based, recommended)

Requires P1 firmware ≥ 2.2.0. Run the token helper once — it'll wait for you to physically press the button on top of the device, then print the token.

```bash
export HOMEWIZARD_HOST=192.168.1.26
npm run get-token
# → press the button when prompted
# → outputs: HOMEWIZARD_TOKEN=ABCDEF0123...

export HOMEWIZARD_TOKEN=ABCDEF0123...
export HOMEWIZARD_API_VERSION=v2
npm start
```

The device ships with a self-signed TLS certificate. By default this server skips certificate verification (`HOMEWIZARD_VERIFY_TLS=false`); set it to `true` if you've installed the device CA on your system.

## Claude Desktop config

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the equivalent on your platform:

```json
{
  "mcpServers": {
    "homewizard": {
      "command": "node",
      "args": ["/absolute/path/to/homewizard-mcp-server/dist/src/index.js"],
      "env": {
        "HOMEWIZARD_HOST": "192.168.1.26",
        "HOMEWIZARD_API_VERSION": "v1"
      }
    }
  }
}
```

Restart Claude Desktop. Ask: *"How much power am I using right now?"* — it should call `homewizard_get_measurement`.

### Running via npx

Once the repo is on GitHub (or published to npm), you can skip the clone entirely:

```json
{
  "mcpServers": {
    "homewizard": {
      "command": "npx",
      "args": ["-y", "github:mrksmts/homewizard-mcp-server"],
      "env": { "HOMEWIZARD_HOST": "192.168.1.26", "HOMEWIZARD_API_VERSION": "v1" }
    }
  }
}
```

Replace `github:mrksmts/homewizard-mcp-server` with `homewizard-mcp-server` if you've published to npm. The `prepare` script in `package.json` builds the project automatically when npm installs from git.

## Configuration

All config is via environment variables. See [`.env.example`](.env.example).

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `HOMEWIZARD_HOST` | yes | — | IP or hostname of your device |
| `HOMEWIZARD_API_VERSION` | no | `v1` | `v1` or `v2` |
| `HOMEWIZARD_TOKEN` | only for v2 | — | Bearer token from `npm run get-token` |
| `HOMEWIZARD_VERIFY_TLS` | no | `false` | Verify the device's TLS cert on v2 |

## What's deliberately not exposed

This server is read-only by design:

- `PUT /api/v1/identify` (LED blink)
- `PUT /api/v1/system` / `PUT /api/system` (toggle cloud, change LED brightness)
- `POST /api/user` (token creation — except via the standalone `get-token` script)
- WebSocket subscriptions (don't fit the MCP request/response model — could be added in a future revision)

If you need any of these, fork or open an issue.

## Project layout

```
src/
  index.ts        # MCP server entry point
  clients.ts      # v1 / v2 client implementations + normalization
  tools.ts        # Tool registrations
  config.ts       # env var parsing
  types.ts        # shared types
  constants.ts
scripts/
  get-token.ts    # one-time v2 token onboarding helper
```

## Contributing

PRs welcome. Some areas where help would be useful:

- Other HomeWizard devices (kWh meter `HWE-KWH1`/`HWE-KWH3`, Watermeter `HWE-WTR`, Energy Socket `HWE-SKT`, Plug-In Battery `HWE-BAT`) — currently the tools are P1-shaped.
- WebSocket-based push streaming (would need a new MCP transport pattern).
- Tests against a fixture HTTP server (no real device required).

## License

MIT
