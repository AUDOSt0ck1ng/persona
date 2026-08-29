/**
 * Where the cursor is relative to the character, shared by everything that
 * needs to know.
 *
 * Held as a mutable object passed by reference rather than as React state:
 * pointer events and frames both arrive far more often than the scene should
 * re-render, and every consumer reads it from inside the render loop anyway.
 */

export interface PointerFocusState {
  /** Whether a real cursor position has been seen at all. */
  havePointer: boolean;
  /** Cursor position in client pixels. Meaningless until `havePointer`. */
  clientX: number;
  clientY: number;
  /**
   * The same position relative to the canvas, filled in by the frame hook that
   * already holds the canvas rect. Reading the rect is a layout read, and once
   * a frame for every consumer is once too many.
   */
  canvasX: number;
  canvasY: number;
  /**
   * Whether the character was drawn under the cursor. Only sampled while the
   * window is routing clicks by the silhouette, which is the one mode that has
   * to read the alpha anyway; otherwise it stays false and nothing reads it.
   */
  overCharacter: boolean;
  /**
   * A press this window received, not merely a held button. A gesture that
   * began on the desktop still forwards its moves here while the window is
   * ignoring the mouse, and must not count as this window's.
   */
  gestureActive: boolean;
}

export function createPointerFocusState(): PointerFocusState {
  return {
    havePointer: false,
    clientX: 0,
    clientY: 0,
    canvasX: 0,
    canvasY: 0,
    overCharacter: false,
    gestureActive: false,
  };
}
