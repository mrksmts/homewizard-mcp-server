export type ApiVersion = "v1" | "v2";

export interface Config {
  host: string;
  apiVersion: ApiVersion;
  token: string | null;
  verifyTls: boolean;
}

export interface DeviceInfo {
  product_type: string | null;
  product_name: string | null;
  serial: string | null;
  firmware_version: string | null;
  api_version: string | null;
}

export interface ExternalDevice {
  unique_id: string | null;
  type: string;
  timestamp: string | null;
  value: number;
  unit: string;
}

/**
 * Canonical measurement shape. v2-style field names. v1 responses are
 * normalized into this shape so tool consumers don't branch on version.
 */
export interface Measurement {
  protocol_version: number | null;
  meter_model: string | null;
  unique_id: string | null;
  timestamp: string | null;
  tariff: number | null;

  energy_import_kwh: number | null;
  energy_import_t1_kwh: number | null;
  energy_import_t2_kwh: number | null;
  energy_import_t3_kwh: number | null;
  energy_import_t4_kwh: number | null;
  energy_export_kwh: number | null;
  energy_export_t1_kwh: number | null;
  energy_export_t2_kwh: number | null;
  energy_export_t3_kwh: number | null;
  energy_export_t4_kwh: number | null;

  power_w: number | null;
  power_l1_w: number | null;
  power_l2_w: number | null;
  power_l3_w: number | null;

  voltage_v: number | null;
  voltage_l1_v: number | null;
  voltage_l2_v: number | null;
  voltage_l3_v: number | null;

  current_a: number | null;
  current_l1_a: number | null;
  current_l2_a: number | null;
  current_l3_a: number | null;

  frequency_hz: number | null;

  voltage_sag_l1_count: number | null;
  voltage_sag_l2_count: number | null;
  voltage_sag_l3_count: number | null;
  voltage_swell_l1_count: number | null;
  voltage_swell_l2_count: number | null;
  voltage_swell_l3_count: number | null;
  any_power_fail_count: number | null;
  long_power_fail_count: number | null;

  average_power_15m_w: number | null;
  monthly_power_peak_w: number | null;
  monthly_power_peak_timestamp: string | null;

  external: ExternalDevice[];
}

export interface SystemStatus {
  wifi_ssid: string | null;
  wifi_rssi_db: number | null;
  uptime_s: number | null;
  cloud_enabled: boolean | null;
  status_led_brightness_pct: number | null;
  api_v1_enabled: boolean | null;
}

