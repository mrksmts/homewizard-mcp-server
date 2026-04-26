import type { ApiVersion, Config } from "./types.js";

export function loadConfig(): Config {
  const host = process.env.HOMEWIZARD_HOST?.trim();
  if (!host) {
    throw new Error(
      "HOMEWIZARD_HOST is required (e.g. 192.168.1.26 or homewizard-XXXXXX.local)",
    );
  }

  const rawVersion = (process.env.HOMEWIZARD_API_VERSION ?? "v1").trim().toLowerCase();
  if (rawVersion !== "v1" && rawVersion !== "v2") {
    throw new Error(
      `HOMEWIZARD_API_VERSION must be "v1" or "v2" (got "${rawVersion}")`,
    );
  }
  const apiVersion = rawVersion as ApiVersion;

  const token = process.env.HOMEWIZARD_TOKEN?.trim() || null;
  if (apiVersion === "v2" && !token) {
    throw new Error(
      'HOMEWIZARD_API_VERSION=v2 requires HOMEWIZARD_TOKEN. Run "npm run get-token" to obtain one.',
    );
  }

  const verifyTls = (process.env.HOMEWIZARD_VERIFY_TLS ?? "false")
    .trim()
    .toLowerCase() === "true";

  return { host, apiVersion, token, verifyTls };
}
