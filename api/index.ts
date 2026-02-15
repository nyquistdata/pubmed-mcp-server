/**
 * @fileoverview Vercel serverless entry point for the MCP server.
 * Reuses the existing Hono HTTP app with a stateless transport manager,
 * adapted for Vercel's serverless function environment via @hono/node-server/vercel.
 *
 * @module api/index
 */

// OTel instrumentation must be imported first (per project convention).
import "../src/utils/telemetry/instrumentation.js";

import { handle } from "@hono/node-server/vercel";
import { createMcpServerInstance } from "../src/mcp-server/server.js";
import { createHttpApp } from "../src/mcp-server/transports/http/httpTransport.js";
import { StatelessTransportManager } from "../src/mcp-server/transports/core/statelessTransportManager.js";
import { requestContextService } from "../src/utils/index.js";

const context = requestContextService.createRequestContext({
  operation: "VercelServerlessInit",
});

const getMcpServer = async () => (await createMcpServerInstance()).server;
const transportManager = new StatelessTransportManager(getMcpServer);
const app = createHttpApp(transportManager, createMcpServerInstance, context);

export default handle(app);
