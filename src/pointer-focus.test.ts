import { describe, expect, it } from 'vitest';
import { createPointerFocusState, pointerHoldsCharacter } from './pointer-focus';

describe('pointerHoldsCharacter', () => {
  it('holds nothing before a cursor has ever been seen', () => {
    const state = createPointerFocusState();
    // Seeded coordinates are the origin, and whether that corner happens to be
    // over the character is a fact about the framing, not about the cursor.
    state.overCharacter = true;
    expect(pointerHoldsCharacter(state)).toBe(false);
  });

  it('holds while the cursor is on the silhouette', () => {
    const state = createPointerFocusState();
    state.havePointer = true;
    state.overCharacter = true;
    expect(pointerHoldsCharacter(state)).toBe(true);
  });

  it('keeps holding through a gesture that slips off the silhouette', () => {
    const state = createPointerFocusState();
    state.havePointer = true;
    state.overCharacter = false;
    state.gestureActive = true;
    expect(pointerHoldsCharacter(state)).toBe(true);
  });

  it('lets go over the transparent area', () => {
    const state = createPointerFocusState();
    state.havePointer = true;
    expect(pointerHoldsCharacter(state)).toBe(false);
  });
});
