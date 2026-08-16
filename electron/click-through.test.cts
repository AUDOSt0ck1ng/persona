import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clickThroughModeFor,
  createClickThroughState,
} from './click-through.cjs';

test("offers the silhouette hit test only where mouse moves are forwarded", () => {
  assert.equal(clickThroughModeFor("win32"), "silhouette");
  assert.equal(clickThroughModeFor("darwin"), "silhouette");
  assert.equal(clickThroughModeFor("linux"), "whole-window");
  assert.equal(clickThroughModeFor("freebsd"), "whole-window");
});

test("starts off on every platform", () => {
  for (const platform of ["win32", "darwin", "linux"]) {
    const state = createClickThroughState(platform);
    assert.equal(state.isEnabled(), false, platform);
    assert.deepEqual(
      state.windowFlags(),
      { ignore: false, forward: false },
      platform,
    );
  }
});

test("asks for forwarding only where the silhouette can be carved out", () => {
  const silhouette = createClickThroughState("win32");
  assert.equal(silhouette.mode, "silhouette");
  assert.equal(silhouette.setEnabled(true), true);
  assert.deepEqual(silhouette.windowFlags(), { ignore: true, forward: true });
  assert.equal(silhouette.setEnabled(false), false);
  assert.deepEqual(silhouette.windowFlags(), { ignore: false, forward: false });

  // Never asks for forwarding the platform cannot honour: an ignoring window
  // that receives no mouse moves could not hand input back on its own, so the
  // tray toggle is the only way out and the window must not pretend otherwise.
  const wholeWindow = createClickThroughState("linux");
  assert.equal(wholeWindow.mode, "whole-window");
  assert.equal(wholeWindow.setEnabled(true), true);
  assert.deepEqual(wholeWindow.windowFlags(), { ignore: true, forward: false });
});

test("applies renderer hit-test results only while enabled", () => {
  const state = createClickThroughState("darwin");
  // Nothing to hand back before the user asks for the mode at all.
  assert.equal(state.passthroughFlags(true), null);

  state.setEnabled(true);
  assert.deepEqual(state.passthroughFlags(true), { ignore: true, forward: true });
  assert.deepEqual(state.passthroughFlags(false), { ignore: false, forward: false });

  state.setEnabled(false);
  assert.equal(state.passthroughFlags(true), null);
});

test("ignores hit-test results that cannot apply", () => {
  const wholeWindow = createClickThroughState("linux");
  wholeWindow.setEnabled(true);
  // The renderer sees no mouse moves here, so any result it sends is stale.
  assert.equal(wholeWindow.passthroughFlags(true), null);
  assert.equal(wholeWindow.passthroughFlags(false), null);

  const silhouette = createClickThroughState("win32");
  silhouette.setEnabled(true);
  assert.equal(silhouette.passthroughFlags("true"), null);
  assert.equal(silhouette.passthroughFlags(1), null);
  assert.equal(silhouette.passthroughFlags(null), null);
  assert.equal(silhouette.passthroughFlags(undefined), null);
});
