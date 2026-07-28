"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { createBridgeServer, normalizeEvent, originAllowed } = require("./bridge-server.cjs");

test("normalizes state and clamps audio level events", () => {
  const state = {
    activity: "speaking",
    microphoneMuted: false,
    outputMuted: false,
    phase: "active",
  };
  assert.deepEqual(normalizeEvent({ type: "state", state }), { type: "state", state });
  assert.deepEqual(normalizeEvent({ type: "audio-level", level: 4 }), {
    type: "audio-level",
    level: 1,
  });
  assert.deepEqual(normalizeEvent({ type: "animation", animation: "DANCE" }), {
    type: "animation",
    animation: "DANCE",
  });
  assert.equal(normalizeEvent({ type: "animation", animation: "UNKNOWN" }), null);
  assert.equal(normalizeEvent({ type: "state", state: { phase: "wat" } }), null);
});

test("only accepts supported app and local webview origins", () => {
  assert.equal(originAllowed("http://127.0.0.1:5175"), true);
  assert.equal(originAllowed("http://localhost:5175"), true);
  assert.equal(originAllowed("codex-app://codex"), true);
  assert.equal(originAllowed("null"), false);
  assert.equal(originAllowed("https://example.com"), false);
  assert.equal(originAllowed("codex://settings"), false);
  assert.equal(originAllowed(undefined), true);
});

test("bridge accepts a valid native adapter state event", async (context) => {
  const events = [];
  const bridge = createBridgeServer({ port: 0, onEvent: (event) => events.push(event) });
  const address = await bridge.listen();
  context.after(() => bridge.close());

  const body = JSON.stringify({
    type: "state",
    state: {
      activity: "listening",
      microphoneMuted: false,
      outputMuted: false,
      phase: "active",
    },
  });
  const status = await new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port: address.port,
        path: "/events",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode));
      },
    );
    request.on("error", reject);
    request.end(body);
  });

  assert.equal(status, 202);
  assert.equal(events.length, 1);
  assert.equal(events[0].state.phase, "active");
});
