"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { createSettingsIpcGate } = require("./settings-ipc.cjs");

function createGateHarness() {
  const handlers = new Map();
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };
  const settingsWebContents = { name: "settings" };
  let settingsWindow = {
    isDestroyed: () => false,
    webContents: settingsWebContents,
  };
  const gate = createSettingsIpcGate({
    ipcMain,
    getSettingsWindow: () => settingsWindow,
  });
  return {
    ...gate,
    handlers,
    fromAvatar: { sender: { name: "avatar" } },
    fromSettings: { sender: settingsWebContents },
    closeSettingsWindow() {
      settingsWindow = null;
    },
    destroySettingsWindow() {
      settingsWindow = { isDestroyed: () => true, webContents: settingsWebContents };
    },
  };
}

test("runs a gated handler on the Settings window's own arguments", async () => {
  const harness = createGateHarness();
  const calls = [];
  harness.handleFromSettings("persona:settings-set-model-lighting", (...args) => {
    calls.push(args);
    return "snapshot";
  });

  const result = await harness.handlers.get(
    "persona:settings-set-model-lighting",
  )(harness.fromSettings, "model-id", { exposure: 1.2 });

  assert.equal(result, "snapshot");
  assert.deepEqual(calls, [["model-id", { exposure: 1.2 }]]);
});

test("rejects a gated handler invoked from the avatar window", async () => {
  const harness = createGateHarness();
  let called = false;
  harness.handleFromSettings("persona:settings-delete-model", () => {
    called = true;
  });

  await assert.rejects(
    async () =>
      harness.handlers.get("persona:settings-delete-model")(
        harness.fromAvatar,
        "model-id",
      ),
    /must come from the Settings window/,
  );
  assert.equal(called, false);
});

test("rejects a gated handler while no Settings window exists", async () => {
  for (const shutSettingsWindow of ["closeSettingsWindow", "destroySettingsWindow"]) {
    const harness = createGateHarness();
    let called = false;
    harness.handleFromSettings("persona:settings-enable-developer", () => {
      called = true;
    });
    harness[shutSettingsWindow]();

    await assert.rejects(
      async () =>
        harness.handlers.get("persona:settings-enable-developer")(
          harness.fromSettings,
        ),
      /Settings window is not available/,
    );
    assert.equal(called, false);
  }
});

test("recognises only the Settings window as a settings sender", () => {
  const harness = createGateHarness();
  assert.equal(harness.isSettingsSender(harness.fromSettings), true);
  assert.equal(harness.isSettingsSender(harness.fromAvatar), false);
  harness.destroySettingsWindow();
  assert.equal(harness.isSettingsSender(harness.fromSettings), false);
  harness.closeSettingsWindow();
  assert.equal(harness.isSettingsSender(harness.fromSettings), false);
});

// Pins the channels any renderer can reach, so a mutator registered through a
// bare ipcMain.handle/on fails here rather than in review.
test("main registers every settings and VRoid Hub channel behind the gate", () => {
  const source = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const channels = (pattern) =>
    [...source.matchAll(pattern)].map((match) => match[1]).sort();

  const ungated = channels(/ipcMain\.(?:handle|on)\(\s*"([^"]+)"/g);
  const gated = channels(/handleFromSettings\(\s*"([^"]+)"/g);

  assert.deepEqual(ungated, [
    "persona:get-snapshot",
    "persona:hide",
    "persona:move-by",
    "persona:settings-get",
    "persona:settings-set-window-theme",
  ]);
  assert.match(
    source.slice(source.indexOf('ipcMain.on("persona:settings-set-window-theme"')),
    /^[^)]*\)[\s\S]{0,600}?isSettingsSender\(event\)/,
    "the one ungated settings channel must still check its sender by hand",
  );
  assert.ok(
    gated.filter((channel) => channel.startsWith("persona:settings-")).length >
      15,
    "expected the settings mutators to be registered through the gate",
  );
  for (const channel of gated) {
    assert.match(channel, /^persona:(settings|vroid)-/);
  }
  assert.ok(
    gated.includes("persona:settings-set-vroid-plaintext-storage") &&
      gated.includes("persona:settings-delete-model") &&
      gated.includes("persona:settings-enable-developer") &&
      gated.includes("persona:vroid-get-credentials"),
  );
});
