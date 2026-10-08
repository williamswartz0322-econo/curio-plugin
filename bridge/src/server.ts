// Curio's MCP server, started by Claude Code for every session where the
// plugin is enabled. It serves the curio tools at once; the HTTP bridge and
// the reader start only when open_reader is called, and stop with the session.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CHANNEL_CAPABILITIES, INSTRUCTIONS } from "./channel";
import { RequestBook } from "./requests";
import { registerTools, type BridgeState } from "./tools";

const mcp = new McpServer(
  { name: "curio", version: "0.1.0" },
  { capabilities: { ...CHANNEL_CAPABILITIES, tools: {} }, instructions: INSTRUCTIONS }
);

const state: BridgeState = { book: new RequestBook(), http: null, reader: null };
registerTools(mcp, state);

let stopped = false;
function shutdown(): void {
  if (stopped) return;
  stopped = true;
  state.reader?.stop();
  state.http?.close();
}

process.on("exit", shutdown);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => {
    shutdown();
    process.exit(0);
  });
}

const transport = new StdioServerTransport();
transport.onclose = () => {
  shutdown();
  process.exit(0);
};
// Claude Code closes our stdin when the session ends.
process.stdin.on("end", () => {
  shutdown();
  process.exit(0);
});

await mcp.connect(transport);
