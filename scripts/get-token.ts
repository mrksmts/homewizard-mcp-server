#!/usr/bin/env node
/**
 * One-time helper: obtain a v2 API token from a HomeWizard device.
 *
 * Usage:
 *   HOMEWIZARD_HOST=192.168.1.26 npm run get-token
 *
 * The device replies with 403 until the physical button on top is pressed.
 * After pressing, you have ~30 seconds to receive the token.
 */
import https from "node:https";
import axios, { AxiosError } from "axios";

const POLL_INTERVAL_MS = 2_000;
const MAX_ATTEMPTS = 60; // ~2 minutes

async function main(): Promise<void> {
  const host = process.env.HOMEWIZARD_HOST?.trim();
  if (!host) {
    console.error("HOMEWIZARD_HOST is required");
    process.exit(1);
  }

  const verifyTls =
    (process.env.HOMEWIZARD_VERIFY_TLS ?? "false").trim().toLowerCase() === "true";

  const client = axios.create({
    baseURL: `https://${host}`,
    timeout: 10_000,
    httpsAgent: new https.Agent({ rejectUnauthorized: verifyTls }),
    headers: {
      "Content-Type": "application/json",
      "X-Api-Version": "2",
    },
  });

  console.error(`Requesting token from ${host}...`);
  console.error("Press the button on top of the HomeWizard device when prompted.");
  console.error("");

  let printedHint = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await client.post<{ token: string }>("/api/user", {
        name: "local/homewizard-mcp",
      });
      const token = res.data?.token;
      if (token) {
        console.error("");
        console.error("Token received. Add this to your environment:");
        console.error("");
        console.log(`HOMEWIZARD_TOKEN=${token}`);
        return;
      }
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 403) {
        if (!printedHint) {
          console.error("Device is waiting for the button press...");
          printedHint = true;
        }
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed: ${message}`);
      process.exit(1);
    }
  }

  console.error("Timed out waiting for button press.");
  process.exit(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
