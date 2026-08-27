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
    expect(cursorAffordanceFor(focusAt(true))).toBe('grab');
  });

  it('closes the hand while a gesture is under way', () => {
    expect(cursorAffordanceFor(focusAt(true, true))).toBe('grabbing');
  });

  it('keeps the closed hand when a drag runs off the silhouette', () => {
    // Orbiting swings the character out from under the cursor. Letting go of
    // the cursor shape there would flicker it for the length of the drag.
    expect(cursorAffordanceFor(focusAt(false, true))).toBe('grabbing');
  });

  it('claims nothing over the transparent area, so the desktop cursor shows', () => {
    expect(cursorAffordanceFor(focusAt(false))).toBe('');
  });

  it('claims nothing before a cursor has been seen', () => {
    expect(cursorAffordanceFor(createPointerFocusState())).toBe('');
  });
});
