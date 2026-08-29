import { describe, expect, it } from 'vitest';
import { cursorAffordanceFor } from './cursor-affordance';
import { createPointerFocusState } from './pointer-focus';

function focusAt(over: boolean, gesture = false) {
  const state = createPointerFocusState();
  state.havePointer = true;
  state.overCharacter = over;
  state.gestureActive = gesture;
  return state;
}

describe('cursorAffordanceFor', () => {
  it('offers a grab over the character', () => {
    expect(cursorAffordanceFor(focusAt(true), 'silhouette')).toBe('grab');
  });

  it('closes the hand while a gesture is under way', () => {
    expect(cursorAffordanceFor(focusAt(true, true), 'silhouette')).toBe(
      'grabbing',
    );
  });

  it('keeps the closed hand when a drag runs off the silhouette', () => {
    // Orbiting swings the character out from under the cursor. Letting go of
    // the cursor shape there would flicker it for the length of the drag.
    expect(cursorAffordanceFor(focusAt(false, true), 'silhouette')).toBe(
      'grabbing',
    );
  });

  it('claims nothing over the transparent area of a click-through window', () => {
    expect(cursorAffordanceFor(focusAt(false), 'silhouette')).toBe('');
  });

  it('claims nothing before a cursor has been seen on the silhouette', () => {
    // Seeded coordinates are the origin, and whether that corner happens to be
    // over the character is a fact about the framing, not about the cursor.
    const state = createPointerFocusState();
    state.overCharacter = true;
    expect(cursorAffordanceFor(state, 'silhouette')).toBe('');
  });

  it('grabs anywhere on a window that takes the click everywhere', () => {
    // No pixel is read on this path: the click lands on the window wherever it
    // is, so the whole canvas is honestly grabbable.
    expect(cursorAffordanceFor(createPointerFocusState(), 'window')).toBe(
      'grab',
    );
    expect(cursorAffordanceFor(focusAt(false), 'window')).toBe('grab');
    expect(cursorAffordanceFor(focusAt(false, true), 'window')).toBe(
      'grabbing',
    );
  });
});
