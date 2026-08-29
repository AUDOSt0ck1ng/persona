import { type PointerFocusState } from './pointer-focus';

/**
 * What the cursor should look like over the avatar window.
 *
 * The character is grabbable rather than clickable: a plain drag orbits the
 * camera and Alt+drag moves the window. Neither is a click, so `grab` is the
 * honest affordance and `pointer` would promise something that does not
 * happen.
 */
export type CursorAffordance = 'grab' | 'grabbing' | '';

/**
 * What the window actually takes input on, which is what the cursor is allowed
 * to promise. `window` is the ordinary case: every pixel of the window takes
 * the click, so the whole canvas is grabbable and no pixel needs reading to
 * say so. `silhouette` is click-through, where only what the character drew
 * takes input and the transparent area has to claim nothing, so the desktop's
 * own cursor shows where the click will really land.
 */
export type CursorHitTest = 'window' | 'silhouette';

export function cursorAffordanceFor(
  state: PointerFocusState,
  hitTest: CursorHitTest,
): CursorAffordance {
  // A gesture keeps the hand closed even once the pointer has slipped off the
  // silhouette, which is what stops the cursor flickering while the user
  // orbits the character out from under it.
  if (state.gestureActive) return 'grabbing';
  if (hitTest === 'window') return 'grab';
  if (!state.havePointer) return '';
  return state.overCharacter ? 'grab' : '';
}
