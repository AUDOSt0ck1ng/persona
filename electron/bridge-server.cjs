"use strict";

const http = require("node:http");

const DEFAULT_PORT = 47831;
const MAX_BODY_BYTES = 64 * 1024;
const TRUSTED_ORIGIN =
  /^(?:https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?|codex-app:\/\/[A-Za-z0-9._~-]*)$/i;
const ANIMATIONS = new Set(["IDLE", "GREETING", "TALK", "CELEBRATE", "DANCE"]);

function isVoiceState(value) {
  return (
    value != null &&
    typeof value === "object" &&
    ["inactive", "starting", "active", "stopping"].includes(value.phase) &&
    ["idle", "listening", "speaking"].includes(value.activity) &&
    typeof value.microphoneMuted === "boolean" &&
    typeof value.outputMuted === "boolean"
  );
}

function normalizeEvent(value) {
  if (value?.type === "state" && isVoiceState(value.state)) {
    return { type: "state", state: value.state };
  }
  if (value?.type === "audio-level" && Number.isFinite(value.level)) {
    const level = Math.max(0, Math.min(1, Number(value.level)));
    const bands =
      value.bands != null && typeof value.bands === "object" ? value.bands : undefined;
    return { type: "audio-level", level, ...(bands ? { bands } : {}) };
  }
  if (value?.type === "animation" && ANIMATIONS.has(value.animation)) {
    return { type: "animation", animation: value.animation };
  }
  return null;
}

function originAllowed(origin) {
  return origin == null || TRUSTED_ORIGIN.test(origin);
}

function createBridgeServer({ host = "127.0.0.1", port = DEFAULT_PORT, onEvent }) {
  let lastStateEvent = null;
  const server = http.createServer((request, response) => {
    const origin = request.headers.origin;
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, lastState: lastStateEvent?.state ?? null }));
      return;
    }

    if (request.method === "OPTIONS" && request.url === "/events" && originAllowed(origin)) {
      response.writeHead(204, {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
        vary: "Origin",
      });
      response.end();
      return;
    }

    if (request.method !== "POST" || request.url !== "/events" || !originAllowed(origin)) {
      response.writeHead(404);
      response.end();
      return;
    }

    let bytes = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        const event = normalizeEvent(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        if (event == null) {
          response.writeHead(422);
          response.end();
          return;
        }
        if (event.type === "state") lastStateEvent = event;
        onEvent(event);
        response.writeHead(202, {
          ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
          "content-type": "application/json",
        });
        response.end('{"accepted":true}');
      } catch {
        response.writeHead(400);
        response.end();
      }
    });
  });

  return {
    getLastStateEvent: () => lastStateEvent,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve(server.address());
        });
      }),
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

module.exports = {
  ANIMATIONS,
  DEFAULT_PORT,
  createBridgeServer,
  isVoiceState,
  normalizeEvent,
  originAllowed,
};
