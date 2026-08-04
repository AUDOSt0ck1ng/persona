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
    // A model is nested under the character that owns it, and the two have
    // separate ids — model pages are addressed by both.
    character: { id: "character-1" },
    portrait_image: { sq300: { url: "https://images.vroid.com/portrait.png" } },
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
        // /api/hearts' data entries are the character models themselves,
        // not a heart record wrapping one under a character_model key.
        return json(response, 200, {
          data: [
            characterModel({
              id: "hearted-allowed",
              name: "Hearted, allowed",
              is_other_users_available: true,
            }),
            characterModel({
              id: "hearted-blocked",
              name: "Hearted, blocked",
              is_other_users_available: false,
            }),
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

test("follows _links.next.href until exhausted so nothing past the first page is lost", async (context) => {
  const requestedUrls = [];
  const server = await startFakeHub(context, {
    onRequest(request, response) {
      requestedUrls.push(request.url);
      const url = new URL(request.url, "http://x");
      if (url.pathname === "/api/account/character_models") {
        const page = url.searchParams.get("max_id") ?? "1";
        // Page 2's link is absolute, page 3's is relative: VRoid Hub is only
        // documented as returning "the next page's URL", so accept both.
        if (page === "1") {
          return json(response, 200, {
            data: [characterModel({ id: "own-1" })],
            _links: {
              next: {
                href: `http://127.0.0.1:${server.address().port}/api/account/character_models?count=100&max_id=2`,
              },
            },
          });
        }
        if (page === "2") {
          return json(response, 200, {
            data: [characterModel({ id: "own-2" })],
            _links: { next: { href: "/api/account/character_models?count=100&max_id=3" } },
          });
        }
        // Last page: a full `data` array but no next link.
        return json(response, 200, { data: [characterModel({ id: "own-3" })] });
      }
      if (url.pathname === "/api/hearts") {
        if (url.searchParams.get("max_id") == null) {
          return json(response, 200, {
            data: [characterModel({ id: "hearted-1" })],
            // The heart endpoint's next link carries application_id forward;
            // the client has to follow the href's query as given, not rebuild
            // it, or page 2 loses the app scoping.
            _links: {
              next: { href: "/api/hearts?count=100&application_id=app-123&max_id=2" },
            },
          });
        }
        return json(response, 200, { data: [characterModel({ id: "hearted-2" })] });
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
    ["hearted-1", "hearted-2", "own-1", "own-2", "own-3"],
  );
  assert.equal(
    requestedUrls.filter((url) => url.startsWith("/api/account/character_models")).length,
    3,
  );
  // Ask for the API's maximum page size, and keep every query parameter the
  // next link hands back rather than reassembling the URL ourselves.
  const [firstAccountUrl] = requestedUrls.filter((url) =>
    url.startsWith("/api/account/character_models"),
  );
  const heartsUrls = requestedUrls.filter((url) => url.startsWith("/api/hearts"));
  assert.equal(new URL(firstAccountUrl, "http://x").searchParams.get("count"), "100");
  assert.equal(new URL(heartsUrls[0], "http://x").searchParams.get("count"), "100");
  assert.equal(
    new URL(heartsUrls[1], "http://x").searchParams.get("application_id"),
    "app-123",
  );
});

test("stops paging rather than replaying a next link that points off the configured host", async (context) => {
  const requestedUrls = [];
  const server = await startFakeHub(context, {
    onRequest(request, response) {
      requestedUrls.push(request.url);
      if (request.url.startsWith("/api/account/character_models")) {
        return json(response, 200, {
          data: [characterModel({ id: "own-1" })],
          // Following this would re-request a foreign URL's path from VRoid
          // Hub; the token itself can't escape, since only the path and
          // query are kept and they're resolved against baseUrl again.
          _links: {
            next: { href: "https://attacker.example/api/account/character_models?count=100" },
          },
        });
      }
      if (request.url.startsWith("/api/hearts")) {
        return json(response, 200, { data: [] });
      }
      response.writeHead(404);
      response.end();
    },
  });
  const client = createVroidHubClient({
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  });

  const characters = await client.listCharacters(TOKEN);

  assert.deepEqual(characters.map((character) => character.id), ["own-1"]);
  assert.equal(
    requestedUrls.filter((url) => url.startsWith("/api/account/character_models")).length,
    1,
  );
});

test("caps paging so an API that always returns a next link can't loop forever", async (context) => {
  let accountRequests = 0;
  const server = await startFakeHub(context, {
    onRequest(request, response) {
      if (request.url.startsWith("/api/account/character_models")) {
        accountRequests += 1;
        return json(response, 200, {
          data: [characterModel({ id: `own-${accountRequests}` })],
          _links: {
            next: { href: `/api/account/character_models?count=100&max_id=${accountRequests}` },
          },
        });
      }
      if (request.url.startsWith("/api/hearts")) {
        return json(response, 200, { data: [] });
      }
      response.writeHead(404);
      response.end();
    },
  });
  const client = createVroidHubClient({
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  });

  const characters = await client.listCharacters(TOKEN);

  assert.equal(accountRequests, 20);
  assert.equal(characters.length, 20);
});

test("extracts VRM 0.0 and VRM 1.0 conditions of use in their own native shapes", async (context) => {
  const server = await startFakeHub(context, {
    onRequest(request, response) {
      if (request.url.startsWith("/api/account/character_models")) {
        return json(response, 200, {
          data: [
            characterModel({
              id: "vrm0-model",
              license: { credit: "necessary", personal_commercial_use: "profit" },
            }),
            characterModel({
              id: "vrm1-model",
              latest_character_model_version: {
                spec_version: "1.0",
                vrm_meta: {
                  commercialUsage: "personalProfit",
                  creditNotation: "required",
                  allowRedistribution: false,
                },
              },
            }),
            characterModel({ id: "no-license-model" }),
          ],
        });
      }
      if (request.url.startsWith("/api/hearts")) {
        return json(response, 200, { data: [] });
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
  const byId = Object.fromEntries(characters.map((c) => [c.id, c.license]));

  assert.deepEqual(byId["vrm0-model"], {
    spec_version: "0.0",
    credit: "necessary",
    personal_commercial_use: "profit",
  });
  assert.deepEqual(byId["vrm1-model"], {
    spec_version: "1.0",
    avatarPermission: undefined,
    allowExcessivelyViolentUsage: undefined,
    allowExcessivelySexualUsage: undefined,
    commercialUsage: "personalProfit",
    allowPoliticalOrReligiousUsage: undefined,
    allowAntisocialOrHateUsage: undefined,
    creditNotation: "required",
    allowRedistribution: false,
    modification: undefined,
  });
  assert.equal(byId["no-license-model"], null);
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

test("carries the owning character's id, which a model's Hub page is addressed by", async (context) => {
  const server = await startFakeHub(context, {
    onRequest(request, response) {
      if (request.url.startsWith("/api/account/character_models")) {
        return json(response, 200, {
          data: [
            characterModel({ id: "model-1", character: { id: "character-9" } }),
            // A model with no character block still lists; the picker just
            // can't offer a link to it.
            characterModel({ id: "model-2", character: undefined }),
          ],
        });
      }
      return json(response, 200, { data: [] });
    },
  });
  const client = createVroidHubClient({
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  });

  const characters = await client.listCharacters(TOKEN);

  assert.deepEqual(
    Object.fromEntries(
      characters.map((character) => [character.id, character.character_id]),
    ),
    { "model-1": "character-9", "model-2": null },
  );
});

test("inlines a listed character's portrait as a data URL without sending the token", async (context) => {
  const portraitBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02]);
  let portraitHeaders = null;
  const server = await startFakeHub(context, {
    onRequest(request, response) {
      if (request.url === "/portrait-sq300.png") {
        portraitHeaders = request.headers;
        response.writeHead(200, { "content-type": "image/png" });
        return response.end(portraitBytes);
      }
      if (request.url.startsWith("/api/account/character_models")) {
        return json(response, 200, {
          data: [
            characterModel({
              id: "own-1",
              portrait_image: {
                // Ordered worst-first to prove the small square crop wins:
                // `original` on VRoid Hub can be a multi-megabyte render.
                original: { url: "/portrait-original.png" },
                sq300: { url: "/portrait-sq300.png" },
              },
            }),
          ],
        });
      }
      return json(response, 200, { data: [] });
    },
  });
  const client = createVroidHubClient({
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  });

  const [character] = await client.listCharacters(TOKEN);
  assert.match(character.portrait_url, /portrait-sq300\.png$/);

  const dataUrl = await client.loadCharacterPortrait("own-1");

  assert.equal(
    dataUrl,
    `data:image/png;base64,${portraitBytes.toString("base64")}`,
  );
  // The image CDN is a different host from the API, so the access token must
  // not ride along with the portrait request.
  assert.equal(portraitHeaders.authorization, undefined);
});

test("returns no portrait for an id the last listing never handed out", async () => {
  const client = createVroidHubClient({ baseUrl: "http://127.0.0.1:1" });

  // Nothing is fetched at all: an unlisted id has no URL, which is what keeps
  // the renderer from steering main-process requests anywhere it likes.
  assert.equal(await client.loadCharacterPortrait("never-listed"), null);
});

test("ignores a portrait response that isn't an image", async (context) => {
  const server = await startFakeHub(context, {
    onRequest(request, response) {
      if (request.url === "/portrait.png") {
        response.writeHead(200, { "content-type": "text/html" });
        return response.end("<script>nope</script>");
      }
      if (request.url.startsWith("/api/account/character_models")) {
        return json(response, 200, {
          data: [
            characterModel({
              id: "own-1",
              portrait_image: { sq300: { url: "/portrait.png" } },
            }),
          ],
        });
      }
      return json(response, 200, { data: [] });
    },
  });
  const client = createVroidHubClient({
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  });

  await client.listCharacters(TOKEN);

  assert.equal(await client.loadCharacterPortrait("own-1"), null);
});

test("requires a character id", async () => {
  const client = createVroidHubClient({ baseUrl: "http://127.0.0.1:1" });
  await assert.rejects(
    () => client.loadCharacterModel(TOKEN, ""),
    /character id is required/i,
  );
});
