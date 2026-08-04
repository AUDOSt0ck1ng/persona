"use strict";

const DEFAULT_BASE_URL = "https://hub.vroid.com";
// VRoid Hub's own API version header, unrelated to this app's version.
const API_VERSION = "11";
// VRoid Hub caps `count` at 100 per page; ask for the maximum so a typical
// library is one request and only unusually large ones need to page at all.
const PAGE_SIZE = 100;
// Paging follows `_links.next.href` until it's absent, so a misbehaving API
// that always returns a next link would loop forever without this ceiling.
// 20 pages of 100 is far past any real VRoid Hub library.
const MAX_PAGES = 20;
const API_REQUEST_TIMEOUT_MS = 15 * 1000;
// A portrait is a small JPEG/PNG on VRoid Hub's image CDN rather than its API,
// so it gets its own budget: generous enough for `original` on a slow link,
// tight enough that one wedged image can't stall the picker.
const PORTRAIT_TIMEOUT_MS = 20 * 1000;
// The variants below are a few hundred pixels wide; anything this far past
// that is not a thumbnail, and inlining it as a data: URL would bloat the
// renderer for no visible gain.
const MAX_PORTRAIT_BYTES = 8 * 1024 * 1024;
// The actual VRM binary can be up to MAX_ASSET_BYTES (200 MB, enforced in
// settings-store.cjs) and is fetched from a presigned storage URL, not
// hub.vroid.com's own API, so it gets a longer allowance than the JSON calls.
const DOWNLOAD_TIMEOUT_MS = 120 * 1000;

function authorizedHeaders({ accessToken, tokenType = "Bearer" } = {}, extra = {}) {
  if (typeof accessToken !== "string" || accessToken === "") {
    throw new Error("A VRoid Hub access token is required.");
  }
  return {
    Authorization: `${tokenType} ${accessToken}`,
    "X-Api-Version": API_VERSION,
    ...extra,
  };
}

// VRoid Hub's conditions-of-use fields live at different paths *and use
// different vocabularies* depending on which VRM spec version the model was
// exported with:
//   - VRM 1.0: flat fields directly on the latest version's vrm_meta
//     (VRM1Meta — camelCase, e.g. commercialUsage/modification/
//     creditNotation), not nested under any `.license` key. See
//     node_modules/@pixiv/three-vrm-core/types/meta/VRM1Meta.d.ts.
//   - VRM 0.0: a separate top-level `license` object (snake_case, VRoid
//     Hub's own vocabulary), per developer.vroid.com's
//     CharacterModelSerializer reference.
// The two share no field names or value vocabularies, so this returns each
// version's native shape tagged with spec_version rather than merging them.
function characterLicense(model) {
  const specVersion = model.latest_character_model_version?.spec_version;
  if (specVersion === "1.0") {
    const vrmMeta = model.latest_character_model_version?.vrm_meta;
    if (vrmMeta == null || typeof vrmMeta !== "object") return null;
    return {
      spec_version: "1.0",
      avatarPermission: vrmMeta.avatarPermission,
      allowExcessivelyViolentUsage: vrmMeta.allowExcessivelyViolentUsage,
      allowExcessivelySexualUsage: vrmMeta.allowExcessivelySexualUsage,
      commercialUsage: vrmMeta.commercialUsage,
      allowPoliticalOrReligiousUsage: vrmMeta.allowPoliticalOrReligiousUsage,
      allowAntisocialOrHateUsage: vrmMeta.allowAntisocialOrHateUsage,
      creditNotation: vrmMeta.creditNotation,
      allowRedistribution: vrmMeta.allowRedistribution,
      modification: vrmMeta.modification,
    };
  }
  if (model.license == null || typeof model.license !== "object") return null;
  return { spec_version: "0.0", ...model.license };
}

// VRoid Hub's PortraitImageSerializer carries the same portrait at several
// sizes: sq150/sq300/sq600 (square crops) and w300/w600 (width-constrained),
// alongside the full-size `original`. The picker draws these as small card
// banners, so prefer a square crop a little larger than the card is wide —
// enough for a HiDPI display, far cheaper than `original`, which on VRoid Hub
// can be a multi-megabyte render. Later entries are pure fallback for models
// whose response is missing the earlier variants.
const PORTRAIT_VARIANTS = [
  "sq300",
  "sq150",
  "sq600",
  "w300",
  "w600",
  "q75",
  "original",
];

function portraitUrl(model) {
  const portrait = model.portrait_image;
  if (portrait == null || typeof portrait !== "object") return null;
  for (const variant of PORTRAIT_VARIANTS) {
    const url = portrait[variant]?.url;
    if (typeof url === "string" && url !== "") return url;
  }
  return null;
}

function toCharacterSummary(model, origin) {
  return {
    id: model.id,
    name:
      typeof model.name === "string" && model.name.trim() !== ""
        ? model.name
        : "Untitled character",
    is_downloadable: Boolean(model.is_downloadable),
    // The character a model belongs to is a separate resource with its own
    // id (CharacterSerializer), and hub.vroid.com pages a model under it:
    // /characters/<character id>/models/<character model id>. Without this,
    // there's no way to build a link to the model that resolves.
    character_id:
      typeof model.character?.id === "string" && model.character.id !== ""
        ? model.character.id
        : null,
    portrait_url: portraitUrl(model),
    origin,
    license: characterLicense(model),
  };
}

/**
 * Thin client for the parts of VRoid Hub's API
 * (https://hub.vroid.com, documented at developer.vroid.com) Persona needs:
 * list the connected account's own and hearted character models, and fetch
 * one model's VRM bytes through the license-gated download flow. No
 * `require("electron")`, so it can be unit tested against a plain fake HTTP
 * server instead of mocking Electron.
 */
function createVroidHubClient({
  applicationId,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = fetch,
} = {}) {
  const baseOrigin = new URL(baseUrl).origin;
  // Portrait URLs the last listCharacters saw, keyed by character id. The
  // renderer asks for a portrait *by id* rather than by URL so that a
  // compromised renderer can't turn the main process into a fetcher for
  // arbitrary URLs — only addresses VRoid Hub itself just handed us are
  // reachable. Rebuilt (not merged) per listing so it can't grow unbounded.
  const portraitUrlsById = new Map();

  async function fetchJson(pathname, token) {
    const url = new URL(pathname, baseUrl);
    const response = await fetchImpl(url.toString(), {
      headers: authorizedHeaders(token),
      signal: AbortSignal.timeout(API_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`VRoid Hub API request failed (${response.status}).`);
    }
    return response.json();
  }

  // VRoid Hub pages with an opaque cursor: each list response carries the
  // next page's URL under `_links.next.href`, and its absence — not a short
  // `data` array — is what marks the last page.
  function nextPagePath(body, currentPath) {
    const href = body?._links?.next?.href;
    if (typeof href !== "string" || href === "") return null;
    const next = new URL(href, new URL(currentPath, baseUrl));
    // Only the path and query survive — fetchJson re-resolves them against
    // baseUrl, so a next link pointing at another host can never send the
    // access token there. Stopping outright on one anyway keeps us from
    // replaying a foreign URL's path against VRoid Hub.
    if (next.origin !== baseOrigin) return null;
    return `${next.pathname}${next.search}`;
  }

  // Walks every page of a list endpoint and returns the merged `data`
  // entries. The character picker wants one complete array, and libraries
  // are small enough that loading them up front beats a "load more" UI.
  async function fetchAllPages(path, token) {
    const items = [];
    let currentPath = path;
    for (let page = 0; page < MAX_PAGES && currentPath != null; page += 1) {
      const body = await fetchJson(currentPath, token);
      if (Array.isArray(body?.data)) items.push(...body.data);
      currentPath = nextPagePath(body, currentPath);
    }
    return items;
  }

  async function listCharacters(token) {
    // application_id scopes the hearts lookup to this registered app, as
    // VRoid Hub's API requires for the heart-scoped endpoints.
    const heartsQuery = new URLSearchParams({ count: String(PAGE_SIZE) });
    if (applicationId) heartsQuery.set("application_id", applicationId);
    const [ownModels, hearts] = await Promise.all([
      fetchAllPages(`/api/account/character_models?count=${PAGE_SIZE}`, token),
      fetchAllPages(`/api/hearts?${heartsQuery.toString()}`, token),
    ]);
    // Only the connected account unconditionally owns its own models; a
    // hearted model created by someone else must be explicitly marked
    // available to other users before Persona is allowed to use it, per
    // VRoid Hub's third-party integration rules. /api/hearts' data entries
    // are the character models themselves, not a heart record wrapping one.
    const heartedModels = hearts.filter(
      (model) => model?.is_other_users_available === true,
    );

    const ownIds = new Set(
      ownModels
        .map((model) => model?.id)
        .filter((id) => typeof id === "string"),
    );
    const byId = new Map();
    for (const model of [...ownModels, ...heartedModels]) {
      if (typeof model?.id !== "string") continue;
      // A model the account both owns and has hearted is still its own —
      // ownership, not the heart, is what exempts it from the third-party
      // conditions-of-use gate.
      const origin = ownIds.has(model.id) ? "own" : "hearted";
      byId.set(model.id, toCharacterSummary(model, origin));
    }
    const characters = [...byId.values()];
    portraitUrlsById.clear();
    for (const character of characters) {
      if (character.portrait_url != null) {
        portraitUrlsById.set(character.id, character.portrait_url);
      }
    }
    return characters;
  }

  /**
   * Downloads one character's portrait and returns it as a data: URL, or null
   * when there's nothing usable to show. The renderer's Content Security
   * Policy allows `img-src 'self' data: blob:` only, so portraits are fetched
   * here and inlined rather than pointed at VRoid Hub's image CDN — which also
   * keeps the settings window from making requests to a third-party host.
   */
  async function loadCharacterPortrait(characterId) {
    const rawUrl = portraitUrlsById.get(characterId);
    if (rawUrl == null) return null;
    // Portraits live on an image CDN, so unlike the paging links this URL is
    // *expected* to point off hub.vroid.com and can't be origin-checked.
    // Resolving it against baseUrl accepts a relative path and, together with
    // the protocol check, keeps a file:/data: URL in the API response from
    // becoming a main-process read.
    let url;
    try {
      url = new URL(rawUrl, baseUrl);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    // Portraits are public CDN objects: sending the account's access token to
    // whatever host VRoid Hub named would leak it off hub.vroid.com, so this
    // request deliberately carries no Authorization header.
    const response = await fetchImpl(url.toString(), {
      signal: AbortSignal.timeout(PORTRAIT_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const contentType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!contentType.startsWith("image/")) return null;
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_PORTRAIT_BYTES) {
      return null;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    // Re-checked against the body itself: content-length is optional, and a
    // chunked response can be any size regardless of what the header claimed.
    if (bytes.byteLength > MAX_PORTRAIT_BYTES) return null;
    return `data:${contentType};base64,${bytes.toString("base64")}`;
  }

  async function loadCharacterModel(token, characterId) {
    if (typeof characterId !== "string" || characterId === "") {
      throw new Error("A character id is required.");
    }
    const licenseResponse = await fetchImpl(
      new URL("/api/download_licenses", baseUrl).toString(),
      {
        method: "POST",
        headers: authorizedHeaders(token, { "content-type": "application/json" }),
        body: JSON.stringify({ character_model_id: characterId }),
        signal: AbortSignal.timeout(API_REQUEST_TIMEOUT_MS),
      },
    );
    if (!licenseResponse.ok) {
      throw new Error(
        `VRoid Hub declined to license this model for download (${licenseResponse.status}).`,
      );
    }
    const license = await licenseResponse.json();
    const licenseId = license?.data?.id;
    if (typeof licenseId !== "string" || licenseId === "") {
      throw new Error("VRoid Hub did not return a download license id.");
    }

    // The download endpoint 302s to a presigned, time-limited URL for the
    // actual VRM binary; Node's fetch (unlike browser fetch) exposes the
    // redirect Location header under redirect: "manual" instead of an
    // opaque-redirect response, which is what makes this two-step flow work.
    const downloadResponse = await fetchImpl(
      new URL(`/api/download_licenses/${licenseId}/download`, baseUrl).toString(),
      {
        method: "GET",
        redirect: "manual",
        headers: authorizedHeaders(token),
        signal: AbortSignal.timeout(API_REQUEST_TIMEOUT_MS),
      },
    );
    const downloadUrl = downloadResponse.headers.get("location");
    if (typeof downloadUrl !== "string" || downloadUrl === "") {
      throw new Error("VRoid Hub did not return a model download URL.");
    }

    const fileResponse = await fetchImpl(downloadUrl, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!fileResponse.ok) {
      throw new Error(`Downloading the VRM file failed (${fileResponse.status}).`);
    }
    return Buffer.from(await fileResponse.arrayBuffer());
  }

  return { listCharacters, loadCharacterModel, loadCharacterPortrait };
}

module.exports = {
  DEFAULT_BASE_URL,
  createVroidHubClient,
};
