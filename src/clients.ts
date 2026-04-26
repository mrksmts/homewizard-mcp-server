import https from "node:https";
import axios, { type AxiosInstance, AxiosError } from "axios";
import { REQUEST_TIMEOUT_MS } from "./constants.js";
import type {
  Config,
  DeviceInfo,
  ExternalDevice,
  Measurement,
  SystemStatus,
} from "./types.js";

export interface HomeWizardClient {
  apiVersion: "v1" | "v2";
  getDeviceInfo(): Promise<DeviceInfo>;
  getMeasurement(): Promise<Measurement>;
  getTelegram(): Promise<string>;
  getSystemStatus(): Promise<SystemStatus>;
}

export function createClient(config: Config): HomeWizardClient {
  return config.apiVersion === "v1" ? new V1Client(config) : new V2Client(config);
}

const EMPTY_MEASUREMENT: Measurement = {
  protocol_version: null,
  meter_model: null,
  unique_id: null,
  timestamp: null,
  tariff: null,
  energy_import_kwh: null,
  energy_import_t1_kwh: null,
  energy_import_t2_kwh: null,
  energy_import_t3_kwh: null,
  energy_import_t4_kwh: null,
  energy_export_kwh: null,
  energy_export_t1_kwh: null,
  energy_export_t2_kwh: null,
  energy_export_t3_kwh: null,
  energy_export_t4_kwh: null,
  power_w: null,
  power_l1_w: null,
  power_l2_w: null,
  power_l3_w: null,
  voltage_v: null,
  voltage_l1_v: null,
  voltage_l2_v: null,
  voltage_l3_v: null,
  current_a: null,
  current_l1_a: null,
  current_l2_a: null,
  current_l3_a: null,
  frequency_hz: null,
  voltage_sag_l1_count: null,
  voltage_sag_l2_count: null,
  voltage_sag_l3_count: null,
  voltage_swell_l1_count: null,
  voltage_swell_l2_count: null,
  voltage_swell_l3_count: null,
  any_power_fail_count: null,
  long_power_fail_count: null,
  average_power_15m_w: null,
  monthly_power_peak_w: null,
  monthly_power_peak_timestamp: null,
  external: [],
};

// ---- v1 ----------------------------------------------------------------

class V1Client implements HomeWizardClient {
  readonly apiVersion = "v1" as const;
  private readonly http: AxiosInstance;

  constructor(config: Config) {
    this.http = axios.create({
      baseURL: `http://${config.host}`,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { Accept: "application/json" },
    });
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    const data = await this.get<Record<string, unknown>>("/api");
    return {
      product_type: asString(data.product_type),
      product_name: asString(data.product_name),
      serial: asString(data.serial),
      firmware_version: asString(data.firmware_version),
      api_version: asString(data.api_version),
    };
  }

  async getMeasurement(): Promise<Measurement> {
    const raw = await this.get<Record<string, unknown>>("/api/v1/data");
    return normalizeV1Measurement(raw);
  }

  async getTelegram(): Promise<string> {
    const res = await this.http.get<string>("/api/v1/telegram", {
      responseType: "text",
      transformResponse: [(v) => v],
    });
    return typeof res.data === "string" ? res.data : String(res.data);
  }

  async getSystemStatus(): Promise<SystemStatus> {
    const data = await this.get<Record<string, unknown>>("/api/v1/system");
    // v1 /system only exposes cloud_enabled. Fill the rest with null.
    return {
      wifi_ssid: null,
      wifi_rssi_db: null,
      uptime_s: null,
      cloud_enabled: asBool(data.cloud_enabled),
      status_led_brightness_pct: null,
      api_v1_enabled: null,
    };
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.http.get<T>(path);
    return res.data;
  }
}

// ---- v2 ----------------------------------------------------------------

class V2Client implements HomeWizardClient {
  readonly apiVersion = "v2" as const;
  private readonly http: AxiosInstance;

  constructor(config: Config) {
    this.http = axios.create({
      baseURL: `https://${config.host}`,
      timeout: REQUEST_TIMEOUT_MS,
      httpsAgent: new https.Agent({ rejectUnauthorized: config.verifyTls }),
      headers: {
        Accept: "application/json",
        "X-Api-Version": "2",
        Authorization: `Bearer ${config.token}`,
      },
    });
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    const data = await this.get<Record<string, unknown>>("/api");
    return {
      product_type: asString(data.product_type),
      product_name: asString(data.product_name),
      serial: asString(data.serial),
      firmware_version: asString(data.firmware_version),
      api_version: asString(data.api_version),
    };
  }

  async getMeasurement(): Promise<Measurement> {
    const raw = await this.get<Record<string, unknown>>("/api/measurement");
    return normalizeV2Measurement(raw);
  }

  async getTelegram(): Promise<string> {
    const res = await this.http.get<string>("/api/telegram", {
      responseType: "text",
      transformResponse: [(v) => v],
    });
    return typeof res.data === "string" ? res.data : String(res.data);
  }

  async getSystemStatus(): Promise<SystemStatus> {
    const data = await this.get<Record<string, unknown>>("/api/system");
    return {
      wifi_ssid: asString(data.wifi_ssid),
      wifi_rssi_db: asNumber(data.wifi_rssi_db),
      uptime_s: asNumber(data.uptime_s),
      cloud_enabled: asBool(data.cloud_enabled),
      status_led_brightness_pct: asNumber(data.status_led_brightness_pct),
      api_v1_enabled: asBool(data.api_v1_enabled),
    };
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.http.get<T>(path);
    return res.data;
  }
}

// ---- normalization -----------------------------------------------------

function normalizeV2Measurement(raw: Record<string, unknown>): Measurement {
  return {
    ...EMPTY_MEASUREMENT,
    protocol_version: asNumber(raw.protocol_version),
    meter_model: asString(raw.meter_model),
    unique_id: asString(raw.unique_id),
    timestamp: asString(raw.timestamp),
    tariff: asNumber(raw.tariff),
    energy_import_kwh: asNumber(raw.energy_import_kwh),
    energy_import_t1_kwh: asNumber(raw.energy_import_t1_kwh),
    energy_import_t2_kwh: asNumber(raw.energy_import_t2_kwh),
    energy_import_t3_kwh: asNumber(raw.energy_import_t3_kwh),
    energy_import_t4_kwh: asNumber(raw.energy_import_t4_kwh),
    energy_export_kwh: asNumber(raw.energy_export_kwh),
    energy_export_t1_kwh: asNumber(raw.energy_export_t1_kwh),
    energy_export_t2_kwh: asNumber(raw.energy_export_t2_kwh),
    energy_export_t3_kwh: asNumber(raw.energy_export_t3_kwh),
    energy_export_t4_kwh: asNumber(raw.energy_export_t4_kwh),
    power_w: asNumber(raw.power_w),
    power_l1_w: asNumber(raw.power_l1_w),
    power_l2_w: asNumber(raw.power_l2_w),
    power_l3_w: asNumber(raw.power_l3_w),
    voltage_v: asNumber(raw.voltage_v),
    voltage_l1_v: asNumber(raw.voltage_l1_v),
    voltage_l2_v: asNumber(raw.voltage_l2_v),
    voltage_l3_v: asNumber(raw.voltage_l3_v),
    current_a: asNumber(raw.current_a),
    current_l1_a: asNumber(raw.current_l1_a),
    current_l2_a: asNumber(raw.current_l2_a),
    current_l3_a: asNumber(raw.current_l3_a),
    frequency_hz: asNumber(raw.frequency_hz),
    voltage_sag_l1_count: asNumber(raw.voltage_sag_l1_count),
    voltage_sag_l2_count: asNumber(raw.voltage_sag_l2_count),
    voltage_sag_l3_count: asNumber(raw.voltage_sag_l3_count),
    voltage_swell_l1_count: asNumber(raw.voltage_swell_l1_count),
    voltage_swell_l2_count: asNumber(raw.voltage_swell_l2_count),
    voltage_swell_l3_count: asNumber(raw.voltage_swell_l3_count),
    any_power_fail_count: asNumber(raw.any_power_fail_count),
    long_power_fail_count: asNumber(raw.long_power_fail_count),
    average_power_15m_w: asNumber(raw.average_power_15m_w),
    monthly_power_peak_w: asNumber(raw.monthly_power_peak_w),
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
    ...EMPTY_MEASUREMENT,
    protocol_version: asNumber(raw.smr_version),
    meter_model: asString(raw.meter_model),
    unique_id: asString(raw.unique_id),
    // v1 has no top-level measurement timestamp; use host clock at fetch time.
    timestamp: new Date().toISOString(),
    tariff: asNumber(raw.active_tariff),
    energy_import_kwh: asNumber(raw.total_power_import_kwh),
    energy_import_t1_kwh: asNumber(raw.total_power_import_t1_kwh),
    energy_import_t2_kwh: asNumber(raw.total_power_import_t2_kwh),
    energy_import_t3_kwh: asNumber(raw.total_power_import_t3_kwh),
    energy_import_t4_kwh: asNumber(raw.total_power_import_t4_kwh),
    energy_export_kwh: asNumber(raw.total_power_export_kwh),
    energy_export_t1_kwh: asNumber(raw.total_power_export_t1_kwh),
    energy_export_t2_kwh: asNumber(raw.total_power_export_t2_kwh),
    energy_export_t3_kwh: asNumber(raw.total_power_export_t3_kwh),
    energy_export_t4_kwh: asNumber(raw.total_power_export_t4_kwh),
    power_w: asNumber(raw.active_power_w),
    power_l1_w: asNumber(raw.active_power_l1_w),
    power_l2_w: asNumber(raw.active_power_l2_w),
    power_l3_w: asNumber(raw.active_power_l3_w),
    voltage_v: asNumber(raw.active_voltage_v),
    voltage_l1_v: asNumber(raw.active_voltage_l1_v),
    voltage_l2_v: asNumber(raw.active_voltage_l2_v),
    voltage_l3_v: asNumber(raw.active_voltage_l3_v),
    current_a: asNumber(raw.active_current_a),
    current_l1_a: asNumber(raw.active_current_l1_a),
    current_l2_a: asNumber(raw.active_current_l2_a),
    current_l3_a: asNumber(raw.active_current_l3_a),
    frequency_hz: asNumber(raw.active_frequency_hz),
    voltage_sag_l1_count: asNumber(raw.voltage_sag_l1_count),
    voltage_sag_l2_count: asNumber(raw.voltage_sag_l2_count),
    voltage_sag_l3_count: asNumber(raw.voltage_sag_l3_count),
    voltage_swell_l1_count: asNumber(raw.voltage_swell_l1_count),
    voltage_swell_l2_count: asNumber(raw.voltage_swell_l2_count),
    voltage_swell_l3_count: asNumber(raw.voltage_swell_l3_count),
    any_power_fail_count: asNumber(raw.any_power_fail_count),
    long_power_fail_count: asNumber(raw.long_power_fail_count),
    average_power_15m_w: asNumber(raw.active_power_average_w),
    // v1 has a typo in the field name: "montly" instead of "monthly".
    monthly_power_peak_w: asNumber(raw.montly_power_peak_w),
    monthly_power_peak_timestamp: parseV1Timestamp(
      asNumber(raw.montly_power_peak_timestamp),
    ),
    external,
  };
}

function parseExternal(raw: unknown): ExternalDevice[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is Record<string, unknown> => e != null && typeof e === "object")
    .map((e) => ({
      unique_id: asString(e.unique_id),
      type: asString(e.type) ?? "unknown",
      timestamp: asString(e.timestamp),
      value: asNumber(e.value) ?? 0,
      unit: asString(e.unit) ?? "",
    }));
}

/**
 * Decodes the YYMMDDHHMMSS integer timestamp format used by v1 (e.g.
 * 230101080010 → "2023-01-01T08:00:10"). Returns null for null/0/undefined.
 * The device emits naive local timestamps (no timezone), matching v2's shape.
 */
function parseV1Timestamp(n: number | null | undefined): string | null {
  if (n == null || n === 0) return null;
  const s = String(Math.trunc(n)).padStart(12, "0");
  if (s.length !== 12) return null;
  const yy = s.slice(0, 2);
  const mm = s.slice(2, 4);
  const dd = s.slice(4, 6);
  const hh = s.slice(6, 8);
  const mi = s.slice(8, 10);
  const ss = s.slice(10, 12);
  return `20${yy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
}

// ---- coercion helpers --------------------------------------------------

function asString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

function asBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  return null;
}

// ---- error formatting --------------------------------------------------

export function describeApiError(error: unknown, context: string): string {
  if (error instanceof AxiosError) {
    if (error.response) {
      const status = error.response.status;
      switch (status) {
        case 401:
          return `Error: ${context} returned 401 Unauthorized. The HOMEWIZARD_TOKEN may be invalid or revoked. Run "npm run get-token" to obtain a new one.`;
        case 403:
          return `Error: ${context} returned 403 Forbidden. For v1, check that the local API is enabled in the HomeWizard app (Settings → Meter → Local API). For v2, the token may not have access.`;
        case 404:
          return `Error: ${context} returned 404 Not Found. The endpoint does not exist on this device or this firmware. P1 v2 requires firmware >= 2.2.0.`;
        case 429:
          return `Error: ${context} returned 429 Rate limit exceeded. Wait a few seconds before retrying.`;
        default:
          return `Error: ${context} failed with HTTP ${status}.`;
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
