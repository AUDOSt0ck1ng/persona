"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("personaBridge", {
  getSnapshot: () => ipcRenderer.invoke("persona:get-snapshot"),
  hide: () => ipcRenderer.send("persona:hide"),
  reportError: (message) => ipcRenderer.send("persona:report-error", message),
  moveBy: (dx, dy) => ipcRenderer.send("persona:move-by", dx, dy),
  subscribe: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("persona:event", handler);
    return () => ipcRenderer.off("persona:event", handler);
  },
});

contextBridge.exposeInMainWorld("personaSettings", {
  get: () => ipcRenderer.invoke("persona:settings-get"),
  importModel: (metadata) =>
    ipcRenderer.invoke("persona:settings-import-model", metadata),
  createAnimation: (metadata) =>
    ipcRenderer.invoke("persona:settings-create-animation", metadata),
  addAnimationClips: (animationId) =>
    ipcRenderer.invoke("persona:settings-add-animation-clips", animationId),
  updateAnimation: (animationId, metadata) =>
    ipcRenderer.invoke(
      "persona:settings-update-animation",
      animationId,
      metadata,
    ),
  deleteAnimation: (animationId) =>
    ipcRenderer.invoke("persona:settings-delete-animation", animationId),
  deleteAnimationClip: (animationId, clipId) =>
    ipcRenderer.invoke(
      "persona:settings-delete-animation-clip",
      animationId,
      clipId,
    ),
  resetPackagedAnimations: () =>
    ipcRenderer.invoke("persona:settings-reset-packaged-animations"),
  deleteModel: (modelId) =>
    ipcRenderer.invoke("persona:settings-delete-model", modelId),
  setDefaultModel: (modelId) =>
    ipcRenderer.invoke("persona:settings-set-default-model", modelId),
  setCharacterSize: (size) =>
    ipcRenderer.invoke("persona:settings-set-character-size", size),
  setAvatarWindowSize: (width, height) =>
    ipcRenderer.invoke(
      "persona:settings-set-avatar-window-size",
      width,
      height,
    ),
  setSpeakingTransition: (transition) =>
    ipcRenderer.invoke(
      "persona:settings-set-speaking-transition",
      transition,
    ),
  setBodyTransitionSeconds: (seconds) =>
    ipcRenderer.invoke("persona:settings-set-body-transition-seconds", seconds),
  enableDeveloperSettings: () =>
    ipcRenderer.invoke("persona:settings-enable-developer"),
  resetDeveloperSettings: () =>
    ipcRenderer.invoke("persona:settings-reset-developer"),
  setVoiceSource: (voiceSource) =>
    ipcRenderer.invoke("persona:settings-set-voice-source", voiceSource),
  listVoiceSources: () =>
    ipcRenderer.invoke("persona:settings-list-voice-sources"),
  setModelLighting: (modelId, lighting) =>
    ipcRenderer.invoke(
      "persona:settings-set-model-lighting",
      modelId,
      lighting,
    ),
  resetModelLighting: (modelId) =>
    ipcRenderer.invoke("persona:settings-reset-model-lighting", modelId),
  getMcpStatus: () =>
    ipcRenderer.invoke("persona:settings-get-mcp-status"),
  setWindowTheme: (theme) =>
    ipcRenderer.send("persona:settings-set-window-theme", theme),
  subscribe: (listener) => {
    const handler = (_event, snapshot) => listener(snapshot);
    ipcRenderer.on("persona:settings-updated", handler);
    return () => ipcRenderer.off("persona:settings-updated", handler);
  },
  subscribeNotice: (listener) => {
    const handler = (_event, message) => listener(message);
    ipcRenderer.on("persona:notice", handler);
    return () => ipcRenderer.off("persona:notice", handler);
  },
});

contextBridge.exposeInMainWorld("personaVroidHub", {
  getStatus: () => ipcRenderer.invoke("persona:vroid-get-status"),
  getCredentials: () => ipcRenderer.invoke("persona:vroid-get-credentials"),
  setCredentials: (clientId, clientSecret) =>
    ipcRenderer.invoke("persona:vroid-set-credentials", clientId, clientSecret),
  clearCredentials: () => ipcRenderer.invoke("persona:vroid-clear-credentials"),
  connect: () => ipcRenderer.invoke("persona:vroid-connect"),
  disconnect: () => ipcRenderer.invoke("persona:vroid-disconnect"),
  listCharacters: () => ipcRenderer.invoke("persona:vroid-list-characters"),
  selectCharacter: (characterId, characterName) =>
    ipcRenderer.invoke(
      "persona:vroid-select-character",
      characterId,
      characterName,
    ),
  subscribe: (listener) => {
    const handler = (_event, status) => listener(status);
    ipcRenderer.on("persona:vroid-status-updated", handler);
    return () => ipcRenderer.off("persona:vroid-status-updated", handler);
  },
});
