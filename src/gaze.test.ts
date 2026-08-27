import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  advanceExcitement,
  advanceGaze,
  advanceGlance,
  attentionForDistance,
  createExcitementState,
  createGazeState,
  createGlanceState,
  DEFAULT_GAZE,
  excitementForSpeed,
  gazeSettingsFor,
  gazeWeightsFor,
  isGazeAtRest,
  reachScaleFor,
  rigTurnFor,
  smoothingFactor,
} from './gaze';
import { definedAt } from './test-support';
import { MIN_GAZE_NOTICE_RADIUS } from './settings-defaults';

function settle(
  state: ReturnType<typeof createGazeState>,
  target: Parameters<typeof advanceGaze>[1],
) {
  for (let frame = 0; frame < 600; frame += 1) {
    advanceGaze(state, target, 1 / 60);
    if (target === null && isGazeAtRest(state)) return frame;
  }
  return -1;
}

// The slider's floor is justified in the settings store by this value, which
// lives here. If the near radius ever climbs past it, every saved radius at the
// minimum reads as no attention anywhere and the feature quietly stops working.
describe('the notice radius the sliders offer', () => {
  it('can never be dragged under the radius attention is full within', () => {
    expect(MIN_GAZE_NOTICE_RADIUS).toBeGreaterThan(DEFAULT_GAZE.nearRadius);
  });
});

describe('attentionForDistance', () => {
  it('is full inside the inner radius and none past the outer', () => {
    expect(attentionForDistance(0)).toBe(1);
    expect(attentionForDistance(DEFAULT_GAZE.nearRadius)).toBe(1);
    expect(attentionForDistance(DEFAULT_GAZE.farRadius)).toBe(0);
    expect(attentionForDistance(10_000)).toBe(0);
  });

  it('falls off monotonically between the radii', () => {
    const { nearRadius, farRadius } = DEFAULT_GAZE;
    let previous = 1;
    for (let d = nearRadius; d <= farRadius; d += 0.02) {
      const attention = attentionForDistance(d);
      expect(attention).toBeLessThanOrEqual(previous);
      previous = attention;
    }
  });

  it('eases in at both ends rather than cornering', () => {
    const { nearRadius, farRadius } = DEFAULT_GAZE;
    const span = farRadius - nearRadius;
    // A smoothstep is flat at the ends: a tenth of the way in has given up far
    // less than a tenth of the attention.
    expect(attentionForDistance(nearRadius + span * 0.1)).toBeGreaterThan(0.9);
    expect(attentionForDistance(farRadius - span * 0.1)).toBeLessThan(0.1);
  });

  it('ignores a distance that is not a number', () => {
    expect(attentionForDistance(Number.NaN)).toBe(0);
  });

  it('gives up on radii that are not a range', () => {
    const settings = { ...DEFAULT_GAZE, nearRadius: 3, farRadius: 1 };
    expect(attentionForDistance(2, settings)).toBe(0);
  });
});

describe('smoothingFactor', () => {
  it('closes the same fraction per second whatever the frame rate', () => {
    const slow = smoothingFactor(1 / 30, 0.2);
    const fast = smoothingFactor(1 / 60, 0.2);
    // Two fast frames must leave as much gap as one slow frame.
    expect((1 - fast) ** 2).toBeCloseTo(1 - slow, 6);
  });

  it('moves nothing on a frame of no time', () => {
    expect(smoothingFactor(0, 0.2)).toBe(0);
  });

  it('snaps when no easing was asked for', () => {
    expect(smoothingFactor(1 / 60, 0)).toBe(1);
  });
});

/**
 * Turns a face direction by a rig turn the way Avatar does, so these tests
 * check the rotation that actually reaches the bones rather than the numbers
 * on the way there.
 */
function faceAfterTurn(faceFrontZ: number, yaw: number, pitch: number) {
  const turn = rigTurnFor(yaw, pitch, faceFrontZ);
  return new THREE.Vector3(0, 0, faceFrontZ)
    .applyQuaternion(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        turn.pitch,
      ),
    )
    .applyQuaternion(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        turn.yaw,
      ),
    );
}

// three-vrm measures a direction as azimuth `atan2(-z, x)` and altitude
// `atan2(y, horizontal)`, and reports the yaw and pitch needed to get there.
// These lock down that a turn built from those numbers moves the face the way
// the numbers meant, for both rig conventions.
describe('rigTurnFor', () => {
  const FACINGS = [
    ['a VRM 1.0 rig, facing +Z', 1],
    ['a VRM 0.x rig, facing -Z', -1],
  ] as const;

  for (const [label, faceFrontZ] of FACINGS) {
    describe(label, () => {
      it('leaves a face that is asked for nothing where it was', () => {
        const face = faceAfterTurn(faceFrontZ, 0, 0);
        expect(face.z).toBeCloseTo(faceFrontZ);
        expect(face.x).toBeCloseTo(0);
        expect(face.y).toBeCloseTo(0);
      });

      it('turns the azimuth by the yaw it was given', () => {
        const face = faceAfterTurn(faceFrontZ, 0.4, 0);
        const azimuthFrom = Math.atan2(-faceFrontZ, 0);
        const azimuthTo = Math.atan2(-face.z, face.x);
        let turned = azimuthTo - azimuthFrom;
        if (turned > Math.PI) turned -= 2 * Math.PI;
        if (turned < -Math.PI) turned += 2 * Math.PI;
        expect(turned).toBeCloseTo(0.4);
      });

      it('looks down for a positive pitch, whichever way the rig faces', () => {
        // The bug this guards: turning about a fixed +X axis tips a +Z face
        // down and a -Z face up, so the pitch has to flip with the facing.
        expect(faceAfterTurn(faceFrontZ, 0, 0.3).y).toBeLessThan(0);
        expect(faceAfterTurn(faceFrontZ, 0, -0.3).y).toBeGreaterThan(0);
      });

      it('keeps the face level when it is only turned sideways', () => {
        expect(faceAfterTurn(faceFrontZ, 0.5, 0).y).toBeCloseTo(0);
      });
    });
  }

  it('passes the yaw through untouched, the axis both conventions share', () => {
    expect(rigTurnFor(0.4, 0.2, 1).yaw).toBe(0.4);
    expect(rigTurnFor(0.4, 0.2, -1).yaw).toBe(0.4);
  });

  it('flips only the pitch, and only for a rig facing -Z', () => {
    expect(rigTurnFor(0.4, 0.2, 1).pitch).toBe(0.2);
    expect(rigTurnFor(0.4, 0.2, -1).pitch).toBe(-0.2);
  });
});

describe('advanceGaze', () => {
  it('settles on the cursor it is given', () => {
    const state = createGazeState();
    settle(state, { distance: 0, yaw: 0.3, pitch: 0.1 });
    expect(state.attention).toBeCloseTo(1, 2);
    expect(state.yaw).toBeCloseTo(0.3, 2);
    expect(state.pitch).toBeCloseTo(0.1, 2);
  });

  it('never turns further than the limits, however far round the cursor is', () => {
    const state = createGazeState();
    settle(state, { distance: 0, yaw: Math.PI, pitch: -Math.PI });
    expect(state.yaw).toBeCloseTo(DEFAULT_GAZE.maxYaw, 2);
    expect(state.pitch).toBeCloseTo(-DEFAULT_GAZE.maxPitch, 2);
  });

  it('spends only as much of the turn as it is paying attention', () => {
    const near = createGazeState();
    settle(near, { distance: DEFAULT_GAZE.nearRadius, yaw: 0.4, pitch: 0 });
    const far = createGazeState();
    const midpoint =
      (DEFAULT_GAZE.nearRadius + DEFAULT_GAZE.farRadius) / 2;
    settle(far, { distance: midpoint, yaw: 0.4, pitch: 0 });
    expect(far.yaw).toBeGreaterThan(0);
    expect(far.yaw).toBeLessThan(near.yaw);
  });

  it('ignores a cursor beyond the outer radius', () => {
    const state = createGazeState();
    settle(state, { distance: DEFAULT_GAZE.farRadius + 0.1, yaw: 0.4, pitch: 0 });
    expect(isGazeAtRest(state)).toBe(true);
  });

  it('returns to rest once the cursor is gone', () => {
    const state = createGazeState();
    settle(state, { distance: 0, yaw: 0.4, pitch: 0 });
    expect(isGazeAtRest(state)).toBe(false);
    expect(settle(state, null)).toBeGreaterThan(0);
    expect(isGazeAtRest(state)).toBe(true);
  });

  it('eases rather than snapping to the cursor', () => {
    const state = createGazeState();
    advanceGaze(state, { distance: 0, yaw: 0.4, pitch: 0 }, 1 / 60);
    const afterOneFrame = state.yaw;
    settle(state, { distance: 0, yaw: 0.4, pitch: 0 });
    expect(afterOneFrame).toBeGreaterThan(0);
    expect(afterOneFrame).toBeLessThan(state.yaw * 0.5);
  });

  it('eases back to rest for an angle that is not a number', () => {
    const state = createGazeState();
    settle(state, { distance: 0, yaw: 0.4, pitch: 0 });
    const held = state.yaw;
    advanceGaze(state, { distance: 0, yaw: Number.NaN, pitch: 0 }, 1 / 60);
    expect(state.yaw).toBeLessThan(held);
    expect(state.yaw).toBeGreaterThan(0);
  });
});

const FRAME = 1 / 60;

/** Moves the cursor at a steady speed for a while, returning the excitement. */
function drag(
  state: ReturnType<typeof createExcitementState>,
  pixelsPerSecond: number,
  seconds: number,
) {
  let x = 0;
  let level = state.level;
  for (let elapsed = 0; elapsed < seconds; elapsed += FRAME) {
    x += pixelsPerSecond * FRAME;
    level = advanceExcitement(state, { x, y: 0 }, FRAME);
  }
  return level;
}

/** Holds the cursor still, returning the excitement. */
function hold(
  state: ReturnType<typeof createExcitementState>,
  seconds: number,
) {
  const { x, y } = state;
  let level = state.level;
  for (let elapsed = 0; elapsed < seconds; elapsed += FRAME) {
    level = advanceExcitement(state, { x, y }, FRAME);
  }
  return level;
}

describe('excitementForSpeed', () => {
  it('ignores a cursor that is barely moving', () => {
    expect(excitementForSpeed(0)).toBe(0);
    expect(excitementForSpeed(DEFAULT_GAZE.restSpeed)).toBe(0);
  });

  it('saturates once the cursor is being thrown about', () => {
    expect(excitementForSpeed(DEFAULT_GAZE.quickSpeed)).toBe(1);
    expect(excitementForSpeed(50_000)).toBe(1);
  });

  it('rises monotonically in between', () => {
    let previous = 0;
    for (
      let speed = DEFAULT_GAZE.restSpeed;
      speed <= DEFAULT_GAZE.quickSpeed;
      speed += 50
    ) {
      const level = excitementForSpeed(speed);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });

  it('gives up on a speed that is not a number or a range that is inverted', () => {
    expect(excitementForSpeed(Number.NaN)).toBe(0);
    expect(
      excitementForSpeed(900, {
        ...DEFAULT_GAZE,
        restSpeed: 1600,
        quickSpeed: 200,
      }),
    ).toBe(0);
  });
});

describe('advanceExcitement', () => {
  it('says nothing on the first sighting, having nothing to measure from', () => {
    const state = createExcitementState();
    expect(advanceExcitement(state, { x: 999, y: 999 }, FRAME)).toBe(0);
  });

  it('answers a thrown cursor within a few frames', () => {
    const state = createExcitementState();
    expect(drag(state, 3000, 0.1)).toBeGreaterThan(0.7);
  });

  it('stays put for a cursor moved deliberately', () => {
    const state = createExcitementState();
    expect(drag(state, DEFAULT_GAZE.restSpeed / 2, 0.5)).toBe(0);
  });

  it('ebbs back to nothing once the cursor stops', () => {
    const state = createExcitementState();
    drag(state, 3000, 0.2);
    expect(hold(state, 3)).toBeLessThan(0.01);
  });

  it('lets go far more slowly than it takes hold', () => {
    // The asymmetry is the effect: a flick has to register at once, while a
    // cursor coming to rest should settle rather than snap back.
    const rising = createExcitementState();
    const roseIn = drag(rising, 3000, 0.06);
    const falling = createExcitementState();
    drag(falling, 3000, 0.3);
    const before = falling.level;
    hold(falling, 0.06);
    const fellBy = before - falling.level;
    expect(roseIn).toBeGreaterThan(fellBy * 3);
  });

  it('does not flinch at a single frame that carries no movement', () => {
    const state = createExcitementState();
    drag(state, 3000, 0.3);
    const before = state.level;
    advanceExcitement(state, { x: state.x, y: state.y }, FRAME);
    expect(state.level).toBeGreaterThan(before * 0.95);
  });

  it('measures nothing across a cursor that left and came back elsewhere', () => {
    const state = createExcitementState();
    drag(state, 3000, 0.3);
    advanceExcitement(state, null, FRAME);
    const away = state.level;
    // A leap from where it left to where it returned is not a speed.
    advanceExcitement(state, { x: 9000, y: 9000 }, FRAME);
    expect(state.level).toBeLessThan(away);
  });
});

describe('reachScaleFor', () => {
  it('leaves the resting reach alone', () => {
    expect(reachScaleFor(0)).toBe(1);
  });

  it('widens the turn as the character is stirred', () => {
    expect(reachScaleFor(1)).toBeGreaterThan(reachScaleFor(0));
    expect(reachScaleFor(0.5)).toBeCloseTo(
      (reachScaleFor(0) + reachScaleFor(1)) / 2,
    );
  });
});

/** Draws from a fixed list, then repeats the last, so a roll is predictable. */
function rolls(...values: number[]) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
}

/** Keeps looking for a while, returning the head's share at the end. */
function keepLooking(
  state: ReturnType<typeof createGlanceState>,
  seconds: number,
  random: () => number,
  attention = 1,
) {
  let commitment = state.commitment;
  for (let elapsed = 0; elapsed < seconds; elapsed += FRAME) {
    commitment = advanceGlance(state, attention, FRAME, DEFAULT_GAZE, random);
  }
  return commitment;
}

describe('advanceGlance', () => {
  it('keeps the head out of a look drawn as a glance', () => {
    const state = createGlanceState();
    // Below eyesOnlyChance: the eyes go on their own.
    expect(keepLooking(state, 1, rolls(0.1, 0.5))).toBeCloseTo(0, 3);
  });

  it('brings the head in when the draw says so, by a share worth having', () => {
    const state = createGlanceState();
    // Kept well inside the shortest hold, so this is one decision throughout.
    const commitment = keepLooking(state, 1, rolls(0.99, 0));
    expect(state.intent).toBeGreaterThanOrEqual(DEFAULT_GAZE.minHeadCommitment);
    expect(state.intent).toBeLessThanOrEqual(1);
    // The head is most of the way there, having eased rather than jumped.
    expect(commitment).toBeGreaterThan(state.intent * 0.9);
    expect(commitment).toBeLessThan(state.intent);
  });

  it('never asks the head for more than the whole turn', () => {
    const state = createGlanceState();
    expect(keepLooking(state, 2, rolls(0.99, 0.999))).toBeLessThanOrEqual(1);
  });

  it('does nothing at all until something is worth looking at', () => {
    const state = createGlanceState();
    expect(keepLooking(state, 2, rolls(0.99, 0), 0)).toBe(0);
    expect(state.looking).toBe(false);
  });

  it('holds one decision rather than dithering frame to frame', () => {
    const state = createGlanceState();
    keepLooking(state, 1, rolls(0.99, 0));
    const decided = state.intent;
    // Well inside minHoldSeconds, so nothing should have been redrawn.
    keepLooking(state, 0.5, rolls(0.1, 0));
    expect(state.intent).toBe(decided);
  });

  it('reconsiders once it has held a look long enough', () => {
    const state = createGlanceState();
    // Draws the shortest hold, then a glance on the redraw.
    keepLooking(state, 0.5, rolls(0.99, 0.5, 0));
    expect(state.intent).toBeGreaterThan(0);
    keepLooking(state, DEFAULT_GAZE.minHoldSeconds + 0.2, rolls(0.1, 0));
    expect(state.intent).toBe(0);
  });

  it('keeps the head out of a glance that follows a committed look', () => {
    const state = createGlanceState();
    // A look the head joined, settled.
    keepLooking(state, 1, rolls(0.99, 0));
    expect(state.commitment).toBeGreaterThan(0.4);

    // The cursor goes. The decision has to go with it: left standing, the idle
    // time is spent easing the head further into a look that is over.
    keepLooking(state, 2, rolls(0.1, 0), 0);
    expect(state.commitment).toBeLessThan(0.01);

    // The next look is drawn as eyes-only, and must start that way rather than
    // turning the head and walking it back.
    const commitment = advanceGlance(state, 1, FRAME, DEFAULT_GAZE, rolls(0.1));
    expect(commitment).toBeLessThan(0.01);
  });

  it('draws again for a look that starts afresh', () => {
    const state = createGlanceState();
    keepLooking(state, 0.5, rolls(0.99, 0));
    expect(state.intent).toBeGreaterThan(0);
    // Attention falls away, ending the look, then returns.
    keepLooking(state, 0.5, rolls(0.1, 0), 0);
    expect(state.looking).toBe(false);
    keepLooking(state, 0.1, rolls(0.1, 0));
    expect(state.intent).toBe(0);
  });

  it('eases a change of mind instead of snapping the head to it', () => {
    const state = createGlanceState();
    keepLooking(state, 1, rolls(0.99, 0));
    const committed = state.commitment;
    expect(committed).toBeGreaterThan(0.4);

    // Change its mind to a glance without waiting for a redraw. The hold has
    // ~0.6s left, so this frame cannot draw again and only the ease applies.
    state.intent = 0;
    advanceGlance(state, 1, FRAME, DEFAULT_GAZE, rolls(0.1));
    expect(state.commitment).toBeLessThan(committed);
    expect(state.commitment).toBeGreaterThan(committed * 0.9);
  });
});

describe('gazeSettingsFor', () => {
  const saved = {
    reaction_size: 4.5,
    notice_radius: 1.4,
    eyes_only_chance: 0.2,
  };

  it('lays the saved sliders over the defaults', () => {
    const settings = gazeSettingsFor(saved);
    expect(settings.screenGain).toBe(4.5);
    expect(settings.farRadius).toBe(1.4);
    expect(settings.eyesOnlyChance).toBe(0.2);
  });

  it('leaves everything the sliders do not offer where it was', () => {
    const settings = gazeSettingsFor(saved);
    // Only three of sixteen are exposed; a saved file must not be able to
    // leave the rest of the gaze in a shape nobody chose.
    expect(settings.maxYaw).toBe(DEFAULT_GAZE.maxYaw);
    expect(settings.maxPitch).toBe(DEFAULT_GAZE.maxPitch);
    expect(settings.nearRadius).toBe(DEFAULT_GAZE.nearRadius);
    expect(settings.responseSeconds).toBe(DEFAULT_GAZE.responseSeconds);
    expect(settings.minHoldSeconds).toBe(DEFAULT_GAZE.minHoldSeconds);
  });

  it('falls back whole when nothing has been saved', () => {
    expect(gazeSettingsFor(null)).toBe(DEFAULT_GAZE);
    expect(gazeSettingsFor(undefined)).toBe(DEFAULT_GAZE);
  });
});

describe('gazeWeightsFor', () => {
  it('shares the turn between neck and head', () => {
    const weights = gazeWeightsFor(['neck', 'head']);
    expect(weights.map(([name]) => name)).toEqual(['neck', 'head']);
    expect(weights.reduce((sum, [, weight]) => sum + weight, 0)).toBeCloseTo(1);
  });

  it('gives the whole turn to the head on a rig with no neck', () => {
    const weights = gazeWeightsFor(['head']);
    expect(definedAt(weights, 0)[1]).toBeCloseTo(1);
  });

  it('turns nothing on a rig with neither', () => {
    expect(gazeWeightsFor(['hips'])).toEqual([]);
  });
});
