"use strict";

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const {
  StreamableHTTPServerTransport,
} = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const z = require("zod/v4");
const { version } = require("../package.json");

const MCP_PATH = "/mcp";
const ANIMATION_NAMES = ["idle", "greeting", "talk", "celebrate", "dance"];
const WINDOW_ACTIONS = ["show", "hide", "toggle"];
const SERVER_INSTRUCTIONS =
  "Persona controls the installed local desktop character. Use play_animation when the user asks for a visual reaction or it clearly supports their request. Use control_window to show, hide, or toggle Persona. Persona never speaks or plays audio. get_status is read-only.";

function textResult(text) {
  return {
    content: [{ type: "text", text }],
  };
}

function createPersonaMcpServer({ onAnimation, onWindowAction, getStatus }) {
  const server = new McpServer(
    {
      name: "Persona",
      version,
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  server.registerTool(
    "play_animation",
    {
      title: "Play Persona animation",
      description:
        "Play one of Persona's installed character animations in the desktop window. This also shows Persona.",
      inputSchema: {
        animation: z
          .enum(ANIMATION_NAMES)
          .describe("The character animation to play."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ animation }) => {
      await onAnimation(animation);
      return textResult(`Persona is playing the ${animation} animation.`);
    },
  );

  server.registerTool(
    "control_window",
    {
      title: "Control Persona window",
      description:
        "Show, hide, or toggle the local Persona window. Hiding the window does not quit Persona.",
      inputSchema: {
        action: z.enum(WINDOW_ACTIONS).describe("The window action to perform."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ action }) => {
      const visible = await onWindowAction(action);
      return textResult(`Persona's window is now ${visible ? "visible" : "hidden"}.`);
    },
  );

  server.registerTool(
    "get_status",
    {
      title: "Get Persona status",
      description:
        "Read Persona's window visibility, voice state, and local listener status.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => textResult(JSON.stringify(await getStatus())),
  );

  return server;
}

function createPersonaMcpHandler(controller) {
  return async (request, response, parsedBody) => {
    const server = createPersonaMcpServer(controller);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, parsedBody);
    } catch (error) {
      if (!response.headersSent) {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          }),
        );
      }
      throw error;
    } finally {
      await transport.close();
      await server.close();
    }
  };
}

module.exports = {
  ANIMATION_NAMES,
  MCP_PATH,
  SERVER_INSTRUCTIONS,
  WINDOW_ACTIONS,
  createPersonaMcpHandler,
  createPersonaMcpServer,
};
