"use strict";

// Both windows load the same preload, so the avatar window holds the same IPC
// surface as Settings. Gating registration rather than each handler's first
// line is deliberate: ~20 settings channels were once added without the guard.
function createSettingsIpcGate({ ipcMain, getSettingsWindow }) {
  function isSettingsSender(event) {
    const settingsWindow = getSettingsWindow();
    if (!settingsWindow || settingsWindow.isDestroyed()) return false;
    return event.sender === settingsWindow.webContents;
  }

  function requireSettingsSender(event) {
    const settingsWindow = getSettingsWindow();
    if (!settingsWindow || settingsWindow.isDestroyed()) {
      throw new Error("The Settings window is not available.");
    }
    if (event.sender !== settingsWindow.webContents) {
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
