import https from "node:https";
import axios, { type AxiosInstance, AxiosError } from "axios";
import { REQUEST_TIMEOUT_MS } from "./constants.js";
import type {
  ApiVersion,
  Config,
  DeviceInfo,
  ExternalDevice,
  Measurement,
  SystemStatus,
} from "./types.js";

export interface HomeWizardClient {
  apiVersion: ApiVersion;
  getDeviceInfo(): Promise<DeviceInfo>;
  getMeasurement(): Promise<Measurement>;
  getTelegram(): Promise<string>;
  getSystemStatus(): Promise<SystemStatus>;
}

export function createClient(config: Config): HomeWizardClient {
  if (config.apiVersion === "v1") {
    return new ConfigurableClient({
      apiVersion: "v1",
      baseURL: `http://${config.host}`,
      headers: {},
      paths: {
        device: "/api",
        measurement: "/api/v1/data",
        telegram: "/api/v1/telegram",
        system: "/api/v1/system",
      },
      normalizeMeasurement: normalizeV1Measurement,
      normalizeSystemStatus: normalizeV1SystemStatus,
    });
  }
  return new ConfigurableClient({
    apiVersion: "v2",
    baseURL: `https://${config.host}`,
    headers: {
      "X-Api-Version": "2",
      Authorization: `Bearer ${config.token}`,
    },
    httpsAgent: new https.Agent({ rejectUnauthorized: config.verifyTls }),
    paths: {
      device: "/api",
      measurement: "/api/measurement",
      telegram: "/api/telegram",
      system: "/api/system",
    },
    normalizeMeasurement: normalizeV2Measurement,
    normalizeSystemStatus: normalizeV2SystemStatus,
  });
}

interface ClientOptions {
  apiVersion: ApiVersion;
  baseURL: string;
  headers: Record<string, string>;
  httpsAgent?: https.Agent;
  paths: { device: string; measurement: string; telegram: string; system: string };
  normalizeMeasurement: (raw: Record<string, unknown>) => Measurement;
  normalizeSystemStatus: (raw: Record<string, unknown>) => SystemStatus;
}

class ConfigurableClient implements HomeWizardClient {
  readonly apiVersion: ApiVersion;
  private readonly http: AxiosInstance;
  private readonly opts: ClientOptions;

  constructor(opts: ClientOptions) {
    this.apiVersion = opts.apiVersion;
    this.opts = opts;
    this.http = axios.create({
      baseURL: opts.baseURL,
      timeout: REQUEST_TIMEOUT_MS,
      httpsAgent: opts.httpsAgent,
      headers: { Accept: "application/json", ...opts.headers },
    });
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    const data = await this.getJson(this.opts.paths.device);
    return {
      product_type: asString(data.product_type),
      product_name: asString(data.product_name),
      serial: asString(data.serial),
      firmware_version: asString(data.firmware_version),
      api_version: asString(data.api_version),
    };
  }

  async getMeasurement(): Promise<Measurement> {
    const raw = await this.getJson(this.opts.paths.measurement);
    return this.opts.normalizeMeasurement(raw);
  }

  async getTelegram(): Promise<string> {
    const res = await this.http.get<string>(this.opts.paths.telegram, {
      responseType: "text",
      transformResponse: [(v) => v],
    });
    return res.data;
  }

  async getSystemStatus(): Promise<SystemStatus> {
    const raw = await this.getJson(this.opts.paths.system);
    return this.opts.normalizeSystemStatus(raw);
  }

  private async getJson(path: string): Promise<Record<string, unknown>> {
    const res = await this.http.get<Record<string, unknown>>(path);
    return res.data;
  }
}

// ---- field map -----------------------------------------------------------

type Coercer = "number" | "string";

interface FieldSpec {
  coerce: Coercer;
  /** Source key in the v1 /api/v1/data response, when it differs from the canonical name. */
  v1Source?: string;
}

/**
 * Canonical (v2-style) field name → coercion + v1 source-key override.
 * Single source of truth; both normalizers iterate this.
 */
const FIELDS: Record<
  Exclude<keyof Measurement, "external" | "timestamp" | "monthly_power_peak_timestamp">,
  FieldSpec
> = {
  protocol_version: { coerce: "number", v1Source: "smr_version" },
  meter_model: { coerce: "string" },
  unique_id: { coerce: "string" },
  tariff: { coerce: "number", v1Source: "active_tariff" },

  energy_import_kwh: { coerce: "number", v1Source: "total_power_import_kwh" },
  energy_import_t1_kwh: { coerce: "number", v1Source: "total_power_import_t1_kwh" },
  energy_import_t2_kwh: { coerce: "number", v1Source: "total_power_import_t2_kwh" },
  energy_import_t3_kwh: { coerce: "number", v1Source: "total_power_import_t3_kwh" },
  energy_import_t4_kwh: { coerce: "number", v1Source: "total_power_import_t4_kwh" },
  energy_export_kwh: { coerce: "number", v1Source: "total_power_export_kwh" },
  energy_export_t1_kwh: { coerce: "number", v1Source: "total_power_export_t1_kwh" },
  energy_export_t2_kwh: { coerce: "number", v1Source: "total_power_export_t2_kwh" },
  energy_export_t3_kwh: { coerce: "number", v1Source: "total_power_export_t3_kwh" },
  energy_export_t4_kwh: { coerce: "number", v1Source: "total_power_export_t4_kwh" },

  power_w: { coerce: "number", v1Source: "active_power_w" },
  power_l1_w: { coerce: "number", v1Source: "active_power_l1_w" },
  power_l2_w: { coerce: "number", v1Source: "active_power_l2_w" },
  power_l3_w: { coerce: "number", v1Source: "active_power_l3_w" },

  voltage_v: { coerce: "number", v1Source: "active_voltage_v" },
  voltage_l1_v: { coerce: "number", v1Source: "active_voltage_l1_v" },
  voltage_l2_v: { coerce: "number", v1Source: "active_voltage_l2_v" },
  voltage_l3_v: { coerce: "number", v1Source: "active_voltage_l3_v" },

  current_a: { coerce: "number", v1Source: "active_current_a" },
  current_l1_a: { coerce: "number", v1Source: "active_current_l1_a" },
  current_l2_a: { coerce: "number", v1Source: "active_current_l2_a" },
  current_l3_a: { coerce: "number", v1Source: "active_current_l3_a" },

  frequency_hz: { coerce: "number", v1Source: "active_frequency_hz" },

  voltage_sag_l1_count: { coerce: "number" },
  voltage_sag_l2_count: { coerce: "number" },
  voltage_sag_l3_count: { coerce: "number" },
  voltage_swell_l1_count: { coerce: "number" },
  voltage_swell_l2_count: { coerce: "number" },
  voltage_swell_l3_count: { coerce: "number" },
  any_power_fail_count: { coerce: "number" },
  long_power_fail_count: { coerce: "number" },

  average_power_15m_w: { coerce: "number", v1Source: "active_power_average_w" },
  // v1 mis-spells "monthly" as "montly" in its JSON. v2 fixed this. We map both
  // to the canonical (correctly-spelled) field — without this override, v1
  // devices would silently drop the value.
  monthly_power_peak_w: { coerce: "number", v1Source: "montly_power_peak_w" },
};

function applyFieldMap(
  raw: Record<string, unknown>,
  version: ApiVersion,
): Omit<Measurement, "external" | "timestamp" | "monthly_power_peak_timestamp"> {
  const out = {} as Record<string, number | string | null>;
  for (const [canonical, spec] of Object.entries(FIELDS)) {
    const key = version === "v1" && spec.v1Source ? spec.v1Source : canonical;
    const value = raw[key];
    out[canonical] = spec.coerce === "number" ? asNumber(value) : asString(value);
  }
  return out as Omit<Measurement, "external" | "timestamp" | "monthly_power_peak_timestamp">;
}

// ---- normalizers --------------------------------------------------------

function normalizeV2Measurement(raw: Record<string, unknown>): Measurement {
  return {
    ...applyFieldMap(raw, "v2"),
    timestamp: asString(raw.timestamp),
    monthly_power_peak_timestamp: asString(raw.monthly_power_peak_timestamp),
    external: parseExternal(raw.external),
  };
}

function normalizeV1Measurement(raw: Record<string, unknown>): Measurement {
  const external: ExternalDevice[] = [];
  const gasValue = asNumber(raw.total_gas_m3);
  if (gasValue != null) {
    external.push({
      unique_id: null,
      type: "gas_meter",
      timestamp: parseV1Timestamp(asNumber(raw.gas_timestamp)),
      value: gasValue,
      unit: "m3",
    });
  }

  return {
    ...applyFieldMap(raw, "v1"),
    // v1 has no top-level measurement timestamp; synthesise one so the field
    // is never null and snapshot logs (in downstream tooling) stay consistent.
    timestamp: new Date().toISOString(),
    monthly_power_peak_timestamp: parseV1Timestamp(
      asNumber(raw.montly_power_peak_timestamp),
    ),
    external,
  };
}

function normalizeV2SystemStatus(raw: Record<string, unknown>): SystemStatus {
  return {
    wifi_ssid: asString(raw.wifi_ssid),
    wifi_rssi_db: asNumber(raw.wifi_rssi_db),
    uptime_s: asNumber(raw.uptime_s),
    cloud_enabled: asBool(raw.cloud_enabled),
    status_led_brightness_pct: asNumber(raw.status_led_brightness_pct),
    api_v1_enabled: asBool(raw.api_v1_enabled),
  };
}

function normalizeV1SystemStatus(raw: Record<string, unknown>): SystemStatus {
  return {
    wifi_ssid: null,
    wifi_rssi_db: null,
    uptime_s: null,
    cloud_enabled: asBool(raw.cloud_enabled),
    status_led_brightness_pct: null,
    api_v1_enabled: null,
  };
}

function parseExternal(raw: unknown): ExternalDevice[] {
  if (!Array.isArray(raw)) return [];
  const out: ExternalDevice[] = [];
  for (const e of raw) {
    if (e == null || typeof e !== "object") continue;
    const entry = e as Record<string, unknown>;
    const value = asNumber(entry.value);
    const unit = asString(entry.unit);
    const type = asString(entry.type);
    if (value == null || type == null || unit == null) continue;
    out.push({
      unique_id: asString(entry.unique_id),
      type,
      timestamp: asString(entry.timestamp),
      value,
      unit,
    });
  }
  return out;
}

/**
 * Decode the YYMMDDHHMMSS integer timestamp format used by v1 (e.g.
 * 230101080010 → "2023-01-01T08:00:10"). Returns null for null/0/undefined.
 * The device emits naive local timestamps (no timezone), matching v2's shape.
 */
function parseV1Timestamp(n: number | null | undefined): string | null {
  if (n == null || n === 0) return null;
  const s = String(Math.trunc(n)).padStart(12, "0");
  if (s.length !== 12) return null;
  return `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}T${s.slice(6, 8)}:${s.slice(8, 10)}:${s.slice(10, 12)}`;
}

// ---- coercion helpers --------------------------------------------------

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

function asBool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

// ---- error formatting --------------------------------------------------

export function describeApiError(error: unknown, context: string): string {
  if (error instanceof AxiosError) {
    if (error.response) {
      switch (error.response.status) {
        case 401:
          return `Error: ${context} returned 401 Unauthorized. The HOMEWIZARD_TOKEN may be invalid or revoked. Run "npm run get-token" to obtain a new one.`;
        case 403:
          return `Error: ${context} returned 403 Forbidden. For v1, check that the local API is enabled in the HomeWizard app (Settings → Meter → Local API). For v2, the token may not have access.`;
        case 404:
          return `Error: ${context} returned 404 Not Found. The endpoint does not exist on this device or this firmware. P1 v2 requires firmware >= 2.2.0.`;
        case 429:
          return `Error: ${context} returned 429 Rate limit exceeded. Wait a few seconds before retrying.`;
        default:
          return `Error: ${context} failed with HTTP ${error.response.status}.`;
      }
    }
    if (error.code === "ECONNABORTED") {
      return `Error: ${context} timed out. Check that HOMEWIZARD_HOST is reachable on the network.`;
    }
    if (error.code === "ECONNREFUSED" || error.code === "EHOSTUNREACH") {
      return `Error: ${context} could not connect to the device. Verify HOMEWIZARD_HOST and that the device is on the same network.`;
    }
    if (error.code === "DEPTH_ZERO_SELF_SIGNED_CERT" || error.code === "SELF_SIGNED_CERT_IN_CHAIN") {
      return `Error: ${context} failed TLS verification (self-signed cert). Set HOMEWIZARD_VERIFY_TLS=false (default) or install the device's CA.`;
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  return `Error: ${context} failed: ${message}`;
}
