import type { ClickThroughMode } from '../shared/persona-api.js';

// `setIgnoreMouseEvents` works everywhere, but its `forward` option is macOS
// and Windows only. Forwarding is what lets an ignoring window still receive
// mouse moves, so only there can the renderer hit-test the silhouette and hand
// input back over the character. Elsewhere the choice is all or nothing.
const MOUSE_FORWARDING_PLATFORMS = new Set(["darwin", "win32"]);

export interface MouseIgnoreFlags {
  ignore: boolean;
  forward: boolean;
}

export interface ClickThroughState {
  readonly mode: ClickThroughMode;
  isEnabled(): boolean;
  setEnabled(enabled: boolean): boolean;
  /** How the window should treat the mouse for the current mode and state. */
  windowFlags(): MouseIgnoreFlags;
  /**
   * Flags for a renderer hit-test result, or `null` when the request should be
   * dropped because no hit-test can apply.
   */
  passthroughFlags(ignore: unknown): MouseIgnoreFlags | null;
}

export function clickThroughModeFor(platform: string): ClickThroughMode {
  return MOUSE_FORWARDING_PLATFORMS.has(platform) ? "silhouette" : "whole-window";
}

export function createClickThroughState(platform: string): ClickThroughState {
  const mode = clickThroughModeFor(platform);
  // Off on every platform, so a fresh install behaves exactly as it did before
  // the mode existed and the window is never ignoring the mouse before anyone
  // asked for it.
  let enabled = false;

  return {
    mode,
    isEnabled() {
      return enabled;
    },
    setEnabled(next) {
      enabled = next;
      return enabled;
    },
    windowFlags() {
      // Silhouette mode also starts by ignoring everywhere; the renderer's
      // first hit-test is what carves the character back out.
      return { ignore: enabled, forward: enabled && mode === "silhouette" };
    },
    passthroughFlags(ignore) {
      if (!enabled || mode !== "silhouette") return null;
      if (typeof ignore !== "boolean") return null;
      return { ignore, forward: ignore };
    },
  };
}
