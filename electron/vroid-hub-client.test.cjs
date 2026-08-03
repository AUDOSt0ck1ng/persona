"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { createVroidHubClient } = require("./vroid-hub-client.cjs");

const TOKEN = { accessToken: "access-1", tokenType: "Bearer" };

function startFakeHub(context, { onRequest }) {
  const server = http.createServer((request, response) => {
    // IncomingMessage's fields (headers included) aren't own-enumerable, so
    // build an explicit plain object rather than `{ ...request }`, which
    // would silently drop `headers`.
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      onRequest(
        {
          url: request.url,
          method: request.method,
          headers: request.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        },
        response,
      );
    });
  });
  context.after(() => new Promise((resolve) => server.close(resolve)));
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function characterModel(overrides = {}) {
  return {
    id: "model-1",
    name: "My Character",
    is_downloadable: false,
    is_other_users_available: true,
    portrait_image: { q75: { url: "https://hub.vroid.com/portrait.png" } },
    ...overrides,
  };
}

test("lists the account's own models and eligible hearted models, filtering ineligible hearts", async (context) => {
  let heartsUrl = null;
  const server = await startFakeHub(context, {
    onRequest(request, response) {
      if (request.url.startsWith("/api/account/character_models")) {
        assert.equal(request.headers.authorization, "Bearer access-1");
        assert.equal(request.headers["x-api-version"], "11");
        return json(response, 200, {
          data: [characterModel({ id: "own-1", name: "Owned" })],
        });
      }
      if (request.url.startsWith("/api/hearts")) {
        heartsUrl = request.url;
        return json(response, 200, {
          data: [
            {
              id: "heart-1",
              character_model: characterModel({
                id: "hearted-allowed",
                name: "Hearted, allowed",
                is_other_users_available: true,
              }),
            },
            {
              id: "heart-2",
              character_model: characterModel({
                id: "hearted-blocked",
                name: "Hearted, blocked",
                is_other_users_available: false,
              }),
            },
          ],
        });
      }
      response.writeHead(404);
      response.end();
    },
  });
  const client = createVroidHubClient({
    applicationId: "app-123",
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  });

  const characters = await client.listCharacters(TOKEN);

  assert.deepEqual(
    characters.map((character) => character.id).sort(),
    ["hearted-allowed", "own-1"],
  );
  assert.deepEqual(
    Object.fromEntries(characters.map((character) => [character.id, character.origin])),
    { "hearted-allowed": "hearted", "own-1": "own" },
  );
  assert.equal(
    new URL(heartsUrl, "http://x").searchParams.get("application_id"),
    "app-123",
  );
});

test("downloads a licensed character model through the redirect flow", async (context) => {
  const fileBytes = Buffer.from("glTFmodelbytes");
  const server = await startFakeHub(context, {
    onRequest(request, response) {
      if (request.method === "POST" && request.url === "/api/download_licenses") {
        assert.equal(request.headers.authorization, "Bearer access-1");
        assert.deepEqual(JSON.parse(request.body), { character_model_id: "model-1" });
        return json(response, 200, { data: { id: "license-1" } });
      }
      if (request.url === "/api/download_licenses/license-1/download") {
        response.writeHead(302, {
          location: `http://127.0.0.1:${server.address().port}/files/model.vrm`,
        });
        return response.end();
      }
      if (request.url === "/files/model.vrm") {
        response.writeHead(200, { "content-type": "model/gltf-binary" });
        return response.end(fileBytes);
      }
      response.writeHead(404);
      response.end();
    },
  });
  const client = createVroidHubClient({
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  });

  const buffer = await client.loadCharacterModel(TOKEN, "model-1");

  assert.equal(Buffer.isBuffer(buffer), true);
  assert.equal(buffer.equals(fileBytes), true);
});

test("surfaces a denied download license instead of guessing a URL", async (context) => {
  const server = await startFakeHub(context, {
    onRequest(_request, response) {
      json(response, 403, { error: "forbidden" });
    },
  });
  const client = createVroidHubClient({
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  });

  await assert.rejects(
    () => client.loadCharacterModel(TOKEN, "model-1"),
    /declined to license/i,
  );
});

test("rejects a redirect response with no Location header", async (context) => {
  const server = await startFakeHub(context, {
    onRequest(request, response) {
      if (request.url === "/api/download_licenses") {
        return json(response, 200, { data: { id: "license-1" } });
      }
      response.writeHead(302);
      response.end();
    },
  });
  const client = createVroidHubClient({
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  });

  await assert.rejects(
    () => client.loadCharacterModel(TOKEN, "model-1"),
    /download URL/i,
  );
});

test("requires a character id", async () => {
  const client = createVroidHubClient({ baseUrl: "http://127.0.0.1:1" });
  await assert.rejects(
    () => client.loadCharacterModel(TOKEN, ""),
    /character id is required/i,
  );
});
