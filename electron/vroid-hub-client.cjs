"use strict";

const DEFAULT_BASE_URL = "https://hub.vroid.com";
// VRoid Hub's own API version header, unrelated to this app's version.
const API_VERSION = "11";
const PAGE_SIZE = 12;
const API_REQUEST_TIMEOUT_MS = 15 * 1000;
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

// VRoid Hub's conditions-of-use fields live at different paths depending on
// which VRM spec version the model was exported with (VRM 1.0 nests them
// under the latest version's vrm_meta; VRM 0.0 exposes a top-level license
// object), per developer.vroid.com's CharacterModelSerializer reference.
function characterLicense(model) {
  return (
    model.latest_character_model_version?.vrm_meta?.license ??
    model.license ??
    null
  );
}

function toCharacterSummary(model, origin) {
  return {
    id: model.id,
    name:
      typeof model.name === "string" && model.name.trim() !== ""
        ? model.name
        : "Untitled character",
    is_downloadable: Boolean(model.is_downloadable),
    portrait_url:
      model.portrait_image?.q75?.url ?? model.portrait_image?.original?.url ?? null,
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

  async function listCharacters(token) {
    // application_id scopes the hearts lookup to this registered app, as
    // VRoid Hub's API requires for the heart-scoped endpoints.
    const heartsQuery = new URLSearchParams({ count: String(PAGE_SIZE) });
    if (applicationId) heartsQuery.set("application_id", applicationId);
    const [account, hearts] = await Promise.all([
      fetchJson(`/api/account/character_models?count=${PAGE_SIZE}`, token),
      fetchJson(`/api/hearts?${heartsQuery.toString()}`, token),
    ]);
    const ownModels = Array.isArray(account?.data) ? account.data : [];
    // Only the connected account unconditionally owns its own models; a
    // hearted model created by someone else must be explicitly marked
    // available to other users before Persona is allowed to use it, per
    // VRoid Hub's third-party integration rules.
    const heartedModels = (Array.isArray(hearts?.data) ? hearts.data : [])
      .map((heart) => heart.character_model)
      .filter((model) => model?.is_other_users_available === true);

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
    return [...byId.values()];
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

  return { listCharacters, loadCharacterModel };
}

module.exports = {
  DEFAULT_BASE_URL,
  createVroidHubClient,
};
