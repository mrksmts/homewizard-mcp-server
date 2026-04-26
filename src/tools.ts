import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CHARACTER_LIMIT } from "./constants.js";
import { type HomeWizardClient, describeApiError } from "./clients.js";
import type { ApiVersion, DeviceInfo, Measurement, SystemStatus } from "./types.js";

type ToolContent = { content: { type: "text"; text: string }[]; isError?: boolean };
type Format = "markdown" | "json";

const ResponseFormatEnum = z.enum(["markdown", "json"]).default("markdown");

const STANDARD_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function registerTools(server: McpServer, client: HomeWizardClient): void {
  registerFormattedTool(server, {
    name: "homewizard_get_device_info",
    title: "Get HomeWizard Device Info",
    description: DEVICE_INFO_DESCRIPTION,
    fetch: () => client.getDeviceInfo(),
    format: formatDeviceInfo,
  });

  registerFormattedTool(server, {
    name: "homewizard_get_measurement",
    title: "Get Live HomeWizard Measurement",
    description: MEASUREMENT_DESCRIPTION,
    fetch: () => client.getMeasurement(),
    format: formatMeasurement,
  });

  registerFormattedTool(server, {
    name: "homewizard_get_system_status",
    title: "Get HomeWizard System Status",
    description: SYSTEM_STATUS_DESCRIPTION,
    fetch: () => client.getSystemStatus(),
    format: (s, format) => formatSystemStatus(s, format, client.apiVersion),
  });

  registerTelegramTool(server, client);
}

function registerFormattedTool<T>(
  server: McpServer,
  config: {
    name: string;
    title: string;
    description: string;
    fetch: () => Promise<T>;
    format: (data: T, format: Format) => string;
  },
): void {
  server.registerTool(
    config.name,
    {
      title: config.title,
      description: config.description,
      inputSchema: { response_format: ResponseFormatEnum },
      annotations: STANDARD_ANNOTATIONS,
    },
    async ({ response_format }): Promise<ToolContent> => {
      try {
        const data = await config.fetch();
        return ok(config.format(data, response_format));
      } catch (error) {
        return err(describeApiError(error, config.name));
      }
    },
  );
}

function registerTelegramTool(server: McpServer, client: HomeWizardClient): void {
  server.registerTool(
    "homewizard_get_telegram",
    {
      title: "Get Raw P1 Telegram",
      description: TELEGRAM_DESCRIPTION,
      inputSchema: {},
      annotations: STANDARD_ANNOTATIONS,
    },
    async (): Promise<ToolContent> => {
      try {
        const telegram = await client.getTelegram();
        return ok(
          telegram.length > CHARACTER_LIMIT
            ? `${telegram.slice(0, CHARACTER_LIMIT)}\n\n[truncated: telegram exceeded ${CHARACTER_LIMIT} chars]`
            : telegram,
        );
      } catch (error) {
        return err(describeApiError(error, "homewizard_get_telegram"));
      }
    },
  );
}

// ---- formatters --------------------------------------------------------

function formatDeviceInfo(info: DeviceInfo, format: Format): string {
  if (format === "json") return JSON.stringify(info, null, 2);
  const lines = ["# HomeWizard Device", ""];
  lines.push(`- **Product**: ${info.product_name ?? "(unknown)"} (${info.product_type ?? "?"})`);
  lines.push(`- **Serial**: ${info.serial ?? "(unknown)"}`);
  lines.push(`- **Firmware**: ${info.firmware_version ?? "(unknown)"}`);
  lines.push(`- **API version**: ${info.api_version ?? "(unknown)"}`);
  return lines.join("\n");
}

function formatMeasurement(m: Measurement, format: Format): string {
  if (format === "json") return JSON.stringify(stripNulls(m), null, 2);

  const lines: string[] = ["# HomeWizard Live Measurement", ""];
  if (m.timestamp) lines.push(`*Reading taken: ${m.timestamp}*`, "");

  lines.push("## Power right now");
  lines.push(`- **Active power**: ${fmtNum(m.power_w, "W")}${m.power_w != null && m.power_w < 0 ? " (exporting)" : ""}`);
  if (m.power_l1_w != null || m.power_l2_w != null || m.power_l3_w != null) {
    lines.push(
      `- **Per phase (L1 / L2 / L3)**: ${fmtNum(m.power_l1_w, "W")} / ${fmtNum(m.power_l2_w, "W")} / ${fmtNum(m.power_l3_w, "W")}`,
    );
  }
  if (m.average_power_15m_w != null) {
    lines.push(`- **15-min average**: ${fmtNum(m.average_power_15m_w, "W")}`);
  }
  if (m.monthly_power_peak_w != null) {
    lines.push(
      `- **Monthly peak (15-min avg)**: ${fmtNum(m.monthly_power_peak_w, "W")}${m.monthly_power_peak_timestamp ? ` at ${m.monthly_power_peak_timestamp}` : ""}`,
    );
  }
  lines.push("");

  lines.push("## Cumulative meter readings (since meter install)");
  lines.push(`- **Import total**: ${fmtNum(m.energy_import_kwh, "kWh")}`);
  if (m.energy_import_t1_kwh != null || m.energy_import_t2_kwh != null) {
    lines.push(
      `  - T1: ${fmtNum(m.energy_import_t1_kwh, "kWh")}, T2: ${fmtNum(m.energy_import_t2_kwh, "kWh")}`,
    );
  }
  lines.push(`- **Export total**: ${fmtNum(m.energy_export_kwh, "kWh")}`);
  if (m.tariff != null) lines.push(`- **Active tariff**: T${m.tariff}`);
  lines.push("");

  if (m.voltage_v != null || m.voltage_l1_v != null) {
    lines.push("## Grid quality");
    if (m.voltage_v != null) lines.push(`- **Voltage**: ${fmtNum(m.voltage_v, "V")}`);
    if (m.voltage_l1_v != null) {
      lines.push(
        `- **Voltage L1 / L2 / L3**: ${fmtNum(m.voltage_l1_v, "V")} / ${fmtNum(m.voltage_l2_v, "V")} / ${fmtNum(m.voltage_l3_v, "V")}`,
      );
    }
    if (m.current_l1_a != null) {
      lines.push(
        `- **Current L1 / L2 / L3**: ${fmtNum(m.current_l1_a, "A")} / ${fmtNum(m.current_l2_a, "A")} / ${fmtNum(m.current_l3_a, "A")}`,
      );
    }
    if (m.frequency_hz != null) lines.push(`- **Frequency**: ${fmtNum(m.frequency_hz, "Hz")}`);
    lines.push("");
  }

  if (m.external.length > 0) {
    lines.push("## External meters");
    for (const e of m.external) {
      lines.push(
        `- **${e.type}**: ${e.value} ${e.unit}${e.timestamp ? ` (at ${e.timestamp})` : ""}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatSystemStatus(s: SystemStatus, format: Format, apiVersion: ApiVersion): string {
  if (format === "json") return JSON.stringify(s, null, 2);
  const lines = [`# HomeWizard System Status (${apiVersion})`, ""];
  if (s.wifi_ssid != null) lines.push(`- **Wi-Fi SSID**: ${s.wifi_ssid}`);
  if (s.wifi_rssi_db != null) lines.push(`- **Wi-Fi RSSI**: ${s.wifi_rssi_db} dBm`);
  if (s.uptime_s != null) lines.push(`- **Uptime**: ${formatUptime(s.uptime_s)}`);
  if (s.cloud_enabled != null) lines.push(`- **Cloud enabled**: ${s.cloud_enabled}`);
  if (s.status_led_brightness_pct != null) lines.push(`- **LED brightness**: ${s.status_led_brightness_pct}%`);
  if (s.api_v1_enabled != null) lines.push(`- **v1 local API enabled**: ${s.api_v1_enabled}`);
  if (lines.length === 2) lines.push("- (no fields populated — v1 only exposes cloud_enabled)");
  return lines.join("\n");
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

// ---- helpers -----------------------------------------------------------

function fmtNum(n: number | null, unit: string): string {
  return n == null ? "(n/a)" : `${n} ${unit}`;
}

function stripNulls(obj: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

function ok(text: string): ToolContent {
  return { content: [{ type: "text", text }] };
}

function err(text: string): ToolContent {
  return { content: [{ type: "text", text }], isError: true };
}

// ---- tool descriptions (kept at the bottom for readability) ------------

const DEVICE_INFO_DESCRIPTION = `Return identifying information about the HomeWizard device behind HOMEWIZARD_HOST: product type (e.g. "HWE-P1" for the P1 meter), product name, serial number, firmware version, and supported API version.

Args:
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Object with: product_type (string), product_name (string), serial (string), firmware_version (string), api_version (string).

Use when:
  - Verifying which HomeWizard device is configured before further calls.
  - Checking firmware version (P1 v2 API requires firmware >= 2.2.0).
Do not use when:
  - You want live energy readings — use homewizard_get_measurement.`;

const MEASUREMENT_DESCRIPTION = `Read the most recent live measurement from the P1 meter. Returns instantaneous power draw (W), per-phase voltages/currents, frequency, and CUMULATIVE energy totals (kWh since the meter was installed) plus any external sub-meters (gas, water).

IMPORTANT: this is the only data the local API exposes. The HomeWizard local API has no historical/aggregate endpoint — there is NO way to ask the device "what did I use today / yesterday / this week / this month / this year". The HomeWizard mobile app shows those numbers because it stores history server-side in their cloud, which the local API does not expose. If a user asks for a time-window total, the most you can say from this tool is the cumulative reading right now; the difference vs. some past point requires that past reading from somewhere else.

Args:
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  - power_w (number, can be negative when exporting): live total active power
  - power_l1_w / power_l2_w / power_l3_w (number): per-phase active power
  - voltage_v / voltage_l1_v ... (number): voltages in volts
  - current_a / current_l1_a ... (number): currents in amperes
  - frequency_hz (number)
  - energy_import_kwh (number): cumulative imported energy since meter install
  - energy_export_kwh (number): cumulative exported energy
  - energy_import_t1_kwh / energy_import_t2_kwh ...: per-tariff cumulative totals
  - tariff (number): currently active tariff (1 or 2 in NL)
  - average_power_15m_w (number, optional): rolling 15-minute average demand (only on capacity-tariff meters)
  - monthly_power_peak_w (number, optional) + monthly_power_peak_timestamp (ISO): peak 15-min demand this month (only on capacity-tariff meters)
  - external (array): sub-meters with { type, value, unit, timestamp } e.g. gas in m3
  - timestamp (ISO string): device-reported time of measurement (or host time on v1)

Use when:
  - User asks "how much am I using right now" → power_w
  - User asks "what's the total kWh on my meter" → energy_import_kwh
  - User asks "am I exporting solar right now" → check sign of power_w
Notes:
  - Negative power_w / power_l*_w means power flowing OUT to the grid (export).`;

const TELEGRAM_DESCRIPTION = `Return the raw DSMR telegram string most recently received from the smart meter. This is the unprocessed text the meter pushes to the P1 port (OBIS codes, line by line, ending with a CRC). Useful for debugging or for clients that prefer to parse DSMR directly.

For structured data, use homewizard_get_measurement instead — it parses the same telegram into JSON fields.

Args: (none)

Returns:
  Plain text DSMR telegram, e.g.:
    /ISK5\\2M550T-1011
    1-3:0.2.8(50)
    0-0:1.0.0(...)
    ...
    !1F28

Only available on the P1 meter (HWE-P1).`;

const SYSTEM_STATUS_DESCRIPTION = `Read the device's system state: Wi-Fi network name and signal strength, uptime, cloud-communication status, status-LED brightness, and whether the v1 local API is currently enabled (v2 only).

This is read-only. The corresponding write endpoints (toggling cloud, identify) are deliberately not exposed by this MCP server.

NOTE: On the v1 API only \`cloud_enabled\` is reported; other fields will be null. Use v2 for full status detail.

Args:
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  - wifi_ssid (string | null)
  - wifi_rssi_db (number | null): Wi-Fi signal strength in dBm (v2 only)
  - uptime_s (number | null): seconds since last boot (v2 only)
  - cloud_enabled (boolean | null)
  - status_led_brightness_pct (number | null, 0-100) (v2 only)
  - api_v1_enabled (boolean | null) (v2 only)

Use when:
  - Diagnosing why a measurement call failed (was the device just rebooted?)
  - Confirming Wi-Fi connectivity quality.`;
