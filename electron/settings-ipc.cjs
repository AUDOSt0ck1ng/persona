"use strict";

// Both windows load the same preload, so the avatar window holds the same IPC
// surface as Settings. Gating registration rather than each handler's first
// line is deliberate: ~20 settings channels were once added without the guard.
function createSettingsIpcGate({ ipcMain, getSettingsWindow }) {
  // The one place the sender rule is derived, so tightening it later cannot
  // reach one caller and miss the other.
  function settingsWebContents() {
    const settingsWindow = getSettingsWindow();
    if (!settingsWindow || settingsWindow.isDestroyed()) return null;
    return settingsWindow.webContents;
  }

  function isSettingsSender(event) {
    const settings = settingsWebContents();
    return settings != null && event.sender === settings;
  }

  function requireSettingsSender(event) {
    const settings = settingsWebContents();
    if (!settings) {
      throw new Error("The Settings window is not available.");
    }
    if (event.sender !== settings) {
      throw new Error("This request must come from the Settings window.");
    }
  }

  function handleFromSettings(channel, handler) {
    ipcMain.handle(channel, (event, ...args) => {
      requireSettingsSender(event);
      return handler(...args);
    });
  }

  return { handleFromSettings, isSettingsSender };
}

module.exports = { createSettingsIpcGate };
