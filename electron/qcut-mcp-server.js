import http from "node:http";
import { randomUUID } from "node:crypto";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, x-wzrd-qcut-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const DEFAULT_PORT = 32145;
const REQUEST_TIMEOUT_MS = 30_000;

const COMMANDS = [
  "getProjectState",
  "listMedia",
  "importMediaByUrl",
  "addClip",
  "addText",
  "splitElement",
  "trimElement",
  "moveElement",
  "deleteElement",
  "addTrack",
  "setText",
  "applyEffect",
  "addCaptionsFromTranscript",
  "setPlayhead",
  "selectElements",
  "undo",
  "redo",
  "export",
  "getExportStatus",
];

const TOOL_DEFS = [
  {
    name: "edit_timeline",
    description:
      "Execute a QCut editor command in the running WZRD Studio Desktop /editor page.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", enum: COMMANDS },
        args: {
          type: "object",
          description: "Command-specific arguments.",
          additionalProperties: true,
          nullable: true,
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
  ...COMMANDS.map((command) => ({
    name: `editor.${command}`,
    description: `Run editor command ${command}.`,
    inputSchema: {
      type: "object",
      description: "Command-specific arguments.",
      additionalProperties: true,
    },
  })),
];

let __serverState = null;

function jsonResponse(res, body, status = 200) {
  res.writeHead(status, {
    ...CORS_HEADERS,
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return null;
  return JSON.parse(raw);
}

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(id, code, message, data) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message, ...(data ? { data } : {}) },
  };
}

export function setupQcutMcpServer({ ipcMain, app }) {
  if (__serverState) {
    return __serverState;
  }

  const pending = new Map(); // requestId -> { resolve, reject, timeout }
  let editorSender = null;
  let editorSenderId = null;

  const allowUnauth = process.env.WZRD_QCUT_MCP_ALLOW_UNAUTH === "1";
  const authToken = process.env.WZRD_QCUT_MCP_TOKEN || randomUUID();

  const isAuthorized = (req) => {
    if (allowUnauth) return true;
    const authHeader = String(req.headers?.authorization ?? "");
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
    const legacyHeader = String(req.headers?.["x-wzrd-qcut-token"] ?? "");
    return bearer === authToken || legacyHeader === authToken;
  };


  const invokeEditor = async ({ command, args }) => {
    if (!editorSender || editorSender.isDestroyed?.()) {
      throw new Error("Editor is not connected (open /projects/:id/editor in the desktop app)");
    }

    const requestId = randomUUID();
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`Editor command timed out after ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS);

      pending.set(requestId, { resolve, reject, timeout });
      editorSender.send("wzrd:qcut:agent-command", {
        requestId,
        command,
        args: args ?? {},
      });
    });
  };

  ipcMain.on("wzrd:qcut:agent:ready", (event, payload) => {
    editorSender = event.sender;
    editorSenderId = event.sender.id;
    if (payload?.projectId) {
      console.info("[WZRD/QCut] Editor agent bridge ready:", payload.projectId);
    } else {
      console.info("[WZRD/QCut] Editor agent bridge ready");
    }
  });

  ipcMain.on("wzrd:qcut:agent-command:response", (event, payload) => {
    if (!payload || typeof payload !== "object") return;
    if (editorSenderId && event.sender.id !== editorSenderId) {
      return;
    }

    const requestId = payload.requestId;
    if (typeof requestId !== "string") return;

    const entry = pending.get(requestId);
    if (!entry) return;

    pending.delete(requestId);
    clearTimeout(entry.timeout);

    if (payload.ok) {
      entry.resolve(payload.result);
    } else {
      entry.reject(new Error(payload.error || "Editor command failed"));
    }
  });

  ipcMain.handle("wzrd:qcut:mcp:get-info", async () => {
    const url = __serverState?.url ?? null;
    return {
      url,
      port: __serverState?.port ?? null,
      editorConnected: Boolean(editorSender && !editorSender.isDestroyed?.()),
      allowUnauth,
      authToken: allowUnauth ? null : authToken,
      authorizationHeader: allowUnauth ? null : `Bearer ${authToken}`,
    };
  });

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
      }

      if (req.method === "GET") {
        jsonResponse(res, {
          name: "wzrd-qcut-editor",
          version: "1.0.0",
          transport: "streamable-http-jsonrpc2",
          endpoint: __serverState?.url ?? null,
          tools: TOOL_DEFS.map((t) => t.name),
        });
        return;
      }

      if (req.method !== "POST") {
        jsonResponse(res, { error: "Method not allowed" }, 405);
        return;
      }


      if (!isAuthorized(req)) {
        jsonResponse(res, rpcError(null, -32001, "Unauthorized"), 401);
        return;
      }

      const rpc = await readJsonBody(req);
      if (!rpc || typeof rpc !== "object") {
        jsonResponse(res, rpcError(null, -32600, "Invalid Request"), 400);
        return;
      }

      const { id, method, params } = rpc;

      if (method === "initialize") {
        jsonResponse(
          res,
          rpcResult(id, {
            protocolVersion: "2025-03-26",
            serverInfo: { name: "wzrd-qcut-editor", version: "1.0.0" },
            capabilities: { tools: {} },
          })
        );
        return;
      }

      if (method === "notifications/initialized") {
        // Notification; no response required.
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
      }

      if (method === "ping") {
        jsonResponse(res, rpcResult(id, {}));
        return;
      }

      if (method === "tools/list") {
        jsonResponse(
          res,
          rpcResult(id, {
            tools: TOOL_DEFS.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
            })),
          })
        );
        return;
      }

      if (method === "tools/call") {
        const toolName = String(params?.name ?? "");
        const toolArgs = (params?.arguments ?? {}) || {};

        let command = null;
        let args = null;

        if (toolName === "edit_timeline") {
          command = String(toolArgs.command ?? "");
          args = toolArgs.args ?? {};
        } else if (toolName.startsWith("editor.")) {
          command = toolName.slice("editor.".length);
          args = toolArgs;
        }

        if (!command || !COMMANDS.includes(command)) {
          jsonResponse(res, rpcError(id, -32601, `Unknown tool: ${toolName}`));
          return;
        }

        try {
          const result = await invokeEditor({ command, args });
          jsonResponse(res, rpcResult(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          jsonResponse(res, rpcError(id, -32000, message));
        }
        return;
      }

      jsonResponse(res, rpcError(id, -32601, `Method not found: ${String(method)}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      jsonResponse(res, rpcError(null, -32000, message), 500);
    }
  });

  const host = "127.0.0.1";

  const listen = (port) =>
    new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen({ host, port }, () => {
        server.off("error", reject);
        resolve();
      });
    });

  const start = async () => {
    const preferred = Number(process.env.WZRD_QCUT_MCP_PORT ?? DEFAULT_PORT);
    try {
      await listen(preferred);
    } catch {
      await listen(0);
    }

    const address = server.address();
    const port = typeof address === "object" && address ? address.port : preferred;
    const url = `http://${host}:${port}`;

    __serverState = {
      server,
      port,
      url,
      close: async () => await new Promise((resolve) => server.close(() => resolve())),
    };

    console.info(`[WZRD/QCut] MCP server listening at ${url}`);
  };

  void start();

  __serverState = {
    server,
    port: null,
    url: null,
    close: async () => await new Promise((resolve) => server.close(() => resolve())),
  };

  return __serverState;
}
