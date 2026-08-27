/**
 * Where the cursor is relative to the character, shared by everything that
 * needs to know.
 *
 * Three features ask the same question — should the click pass through, should
 * the cursor read as grabbable, should the character look up — and the answer
 * costs a `readPixels` of the frame the user is looking at. Sampling it once
 * and handing the result around keeps that cost at one per frame however many
 * consumers there are.
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
   * The same position relative to the canvas, filled in by the sampler that
   * already holds the canvas rect. Reading the rect is a layout read, and once
   * a frame for every consumer is once too many.
   */
  canvasX: number;
  canvasY: number;
  /** Whether the last sample found the character drawn under the cursor. */
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

/**
 * Whether the character should be treated as under the cursor for gaze and for
 * the cursor shape. A gesture in progress keeps the character claimed even if
 * the pointer has slipped off the silhouette mid-drag, which is what stops the
 * cursor flickering between grabbing and default while the user orbits.
 */
export function pointerHoldsCharacter(state: PointerFocusState): boolean {
  if (!state.havePointer) return false;
  return state.overCharacter || state.gestureActive;
}
