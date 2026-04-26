#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "./clients.js";
import { loadConfig } from "./config.js";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { registerTools } from "./tools.js";

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[homewizard-mcp] Configuration error: ${msg}`);
    process.exit(1);
  }

  const client = createClient(config);

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(
    `[homewizard-mcp] Connected. host=${config.host} api=${config.apiVersion}`,
  );
}

main().catch((error) => {
  console.error("[homewizard-mcp] Fatal error:", error);
  process.exit(1);
});
