import { pointerHoldsCharacter, type PointerFocusState } from './pointer-focus';

/**
 * What the cursor should look like over the avatar window.
 *
 * The character is grabbable rather than clickable: a plain drag orbits the
 * camera and Alt+drag moves the window. Neither is a click, so `grab` is the
 * honest affordance and `pointer` would promise something that does not
 * happen. The transparent area around the character claims nothing, which
 * leaves the desktop's own cursor showing where the click will actually land.
 */
export type CursorAffordance = 'grab' | 'grabbing' | '';

export function cursorAffordanceFor(state: PointerFocusState): CursorAffordance {
  if (!pointerHoldsCharacter(state)) return '';
  return state.gestureActive ? 'grabbing' : 'grab';
}
