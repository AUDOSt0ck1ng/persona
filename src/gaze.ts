/**
 * Attention toward the cursor.
 *
 * The character notices a cursor that comes near, turns its head toward it,
 * and lets go when the cursor leaves.
 *
 * *How near* is measured against the character rather than against the screen.
 * A radius in pixels would be a different distance for every window size and
 * zoom, and the avatar window is resizable: the same radius that reaches a
 * character's shoulders in a small window barely leaves her chin in a large
 * one. Measuring in world units makes the reactive zone scale with her.
 *
 * *Which way* is not worked out here at all. three-vrm already computes the
 * angles from a head to a point, and it accounts for things that are easy to
 * get wrong from the outside: which way the rig faces, and whatever the
 * animation has already done to the neck. This module takes those angles,
 * eases and limits them, and says how to turn the rig by them.
 */

export interface GazeSettings {
  /**
   * How far out to the side the character treats the cursor as being, as a
   * multiple of where it honestly is.
   *
   * The avatar window subtends around twenty degrees of the camera's view, so
   * a character looking at a point on it truthfully would turn about six
   * degrees from the middle of the window to its edge — a movement too small
   * to read as looking at anything. Carrying the point further out buys the
   * turn back. The limits below still cap whatever this asks for.
   */
  screenGain: number;
  /** Within this far of the head, in world units, attention is full. */
  nearRadius: number;
  /** Beyond this far, in world units, attention is none. */
  farRadius: number;
  /** Largest head turn, in radians. The eyes cover anything past it. */
  maxYaw: number;
  /** Largest head tilt. Smaller than yaw: necks nod less than they turn. */
  maxPitch: number;
  /**
   * Seconds for the gaze to close most of the gap to where it is headed. The
   * head eases onto the cursor instead of snapping, which is what reads as
   * looking rather than as tracking.
   */
  responseSeconds: number;
  /** Cursor speed, in pixels per second, that counts as standing still. */
  restSpeed: number;
  /** Speed at which the character is as stirred as it gets. */
  quickSpeed: number;
  /** Seconds for that to take hold. Short: reacting late is not reacting. */
  exciteRiseSeconds: number;
  /** Seconds for it to ebb once the cursor stops. Long enough to settle. */
  exciteFallSeconds: number;
  /** Extra reach at full excitement, as a fraction of the resting reach. */
  exciteGain: number;
  /** How often a look is a glance the head stays out of entirely. */
  eyesOnlyChance: number;
  /** The least the head joins in by, when it joins in at all. */
  minHeadCommitment: number;
  /** Seconds for the head to join a look, or to drop out of one. */
  glanceSeconds: number;
  /** How long the character holds to one decision before reconsidering. */
  minHoldSeconds: number;
  maxHoldSeconds: number;
}

export const DEFAULT_GAZE: GazeSettings = {
  screenGain: 3,
  // About a head and a half out, and about an arm's length: near enough to be
  // arriving, far enough to have left. A VRM head is roughly 0.23 tall, so
  // these read the same whatever size the window has been dragged to.
  nearRadius: 0.3,
  farRadius: 0.85,
  maxYaw: 0.5,
  // Not far below the yaw. A neck does pitch less than it turns, but taking
  // that too literally leaves the up-and-down looking like no reaction at all,
  // which is the one direction a window taller than it is wide most needs.
  maxPitch: 0.42,
  responseSeconds: 0.18,
  // A deliberate move across the window runs a few hundred pixels a second; a
  // flick thrown at the character runs thousands.
  restSpeed: 200,
  quickSpeed: 1600,
  exciteRiseSeconds: 0.06,
  exciteFallSeconds: 0.55,
  exciteGain: 1,
  // Most looks are a glance. Turning the head every time is the thing that
  // reads as mechanical, so the head is the exception rather than the rule,
  // and when it does join in it commits enough to be worth having done.
  eyesOnlyChance: 0.55,
  minHeadCommitment: 0.45,
  glanceSeconds: 0.3,
  minHoldSeconds: 1.6,
  maxHoldSeconds: 4.5,
};

// Hysteresis, so attention wavering around one number cannot re-roll the
// decision every few frames.
const GLANCE_START = 0.15;
const GLANCE_END = 0.05;

/**
 * How much the cursor's recent movement has stirred the character, from 0 to
 * 1, alongside the position it was last seen at to measure that from.
 */
export interface ExcitementState {
  level: number;
  x: number;
  y: number;
  seen: boolean;
}

export function createExcitementState(): ExcitementState {
  return { level: 0, x: 0, y: 0, seen: false };
}

/** What a cursor speed is worth, from a still cursor at 0 to a thrown one at 1. */
export function excitementForSpeed(
  speed: number,
  settings: GazeSettings = DEFAULT_GAZE,
): number {
  const { restSpeed, quickSpeed } = settings;
  if (!Number.isFinite(speed)) return 0;
  if (quickSpeed <= restSpeed) return 0;
  if (speed <= restSpeed) return 0;
  if (speed >= quickSpeed) return 1;
  const t = (speed - restSpeed) / (quickSpeed - restSpeed);
  return t * t * (3 - 2 * t);
}

/**
 * Advances the excitement from where the cursor is now, and returns it.
 *
 * It rises far faster than it falls. That asymmetry is the whole effect: a
 * cursor thrown at the character has to be answered on the frame it arrives,
 * while one that stops is let go of slowly enough to settle rather than snap.
 * It also does the filtering for free — a single frame that happens to carry
 * no movement barely dents a level that only ebbs over half a second.
 */
export function advanceExcitement(
  state: ExcitementState,
  cursor: { x: number; y: number } | null,
  delta: number,
  settings: GazeSettings = DEFAULT_GAZE,
): number {
  let target = 0;
  if (cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y)) {
    if (state.seen && delta > 0) {
      target = excitementForSpeed(
        Math.hypot(cursor.x - state.x, cursor.y - state.y) / delta,
        settings,
      );
    }
    state.x = cursor.x;
    state.y = cursor.y;
    state.seen = true;
  } else {
    // A cursor that has gone says nothing about speed, and the place it left
    // would read as a leap when it comes back somewhere else.
    state.seen = false;
  }
  const response =
    target > state.level
      ? settings.exciteRiseSeconds
      : settings.exciteFallSeconds;
  state.level += (target - state.level) * smoothingFactor(delta, response);
  return state.level;
}

/**
 * How far to carry the looked-at point out compared with resting, so a cursor
 * that arrives briskly is answered with a wider turn than one that creeps.
 * The limits still cap what this asks for.
 */
export function reachScaleFor(
  excitement: number,
  settings: GazeSettings = DEFAULT_GAZE,
): number {
  return 1 + excitement * settings.exciteGain;
}

/**
 * Whether this particular look is one the head joins in with.
 *
 * People mostly glance: the eyes go and the head stays. A character that turns
 * its head at every cursor that comes near reads as a mechanism rather than as
 * something alive, so each fresh look draws for how much the head commits, and
 * reconsiders if the look goes on long enough.
 */
export interface GlanceState {
  /** The head's eased share of the turn. 0 is a look done with the eyes alone. */
  commitment: number;
  /** The share last decided on, which `commitment` eases toward. */
  intent: number;
  /** Seconds left before reconsidering, while the same look continues. */
  hold: number;
  /** Whether a look is under way, so a new one can be told from the same one. */
  looking: boolean;
}

export function createGlanceState(): GlanceState {
  return { commitment: 0, intent: 0, hold: 0, looking: false };
}

function decideGlance(
  state: GlanceState,
  settings: GazeSettings,
  random: () => number,
): void {
  state.intent =
    random() < settings.eyesOnlyChance
      ? 0
      : settings.minHeadCommitment +
        random() * (1 - settings.minHeadCommitment);
  state.hold =
    settings.minHoldSeconds +
    random() * (settings.maxHoldSeconds - settings.minHoldSeconds);
}

/**
 * Advances the decision and returns how much of the turn the head should take.
 * Multiply the gaze angles by it; the eyes are unaffected and go the whole way
 * regardless.
 */
export function advanceGlance(
  state: GlanceState,
  attention: number,
  delta: number,
  settings: GazeSettings = DEFAULT_GAZE,
  random: () => number = Math.random,
): number {
  if (state.looking) {
    if (attention < GLANCE_END) {
      state.looking = false;
      // The decision goes with the look. Left standing, `commitment` spends the
      // idle time easing up to it, and the next look — however it is drawn —
      // starts with the head already committed and has to walk it back.
      state.intent = 0;
    } else {
      state.hold -= delta;
      if (state.hold <= 0) decideGlance(state, settings, random);
    }
  } else if (attention > GLANCE_START) {
    state.looking = true;
    decideGlance(state, settings, random);
  }
  // Eased, so changing its mind part way through a look turns the head over a
  // moment instead of snapping it to the new share.
  state.commitment +=
    (state.intent - state.commitment) *
    smoothingFactor(delta, settings.glanceSeconds);
  return state.commitment;
}

export interface GazeState {
  /** Current attention, 0 to 1. */
  attention: number;
  /**
   * Current angles in radians, already eased and limited, in the convention
   * three-vrm reports: yaw turns toward the rig's own +X and a positive pitch
   * looks *down*.
   */
  yaw: number;
  pitch: number;
}

export function createGazeState(): GazeState {
  return { attention: 0, yaw: 0, pitch: 0 };
}

export interface RigTurn {
  /** Radians to rotate the rig about its own +Y axis. */
  yaw: number;
  /** Radians to rotate it about its own +X axis. */
  pitch: number;
}

/**
 * How far to rotate the rig about its own axes to look by the angles three-vrm
 * reports, given which way the face points in that same frame.
 *
 * The catch this exists for: a VRM 0.x rig faces -Z in its own frame while a
 * 1.0 rig faces +Z, and `VRMUtils.rotateVRM0` fixes that by turning the scene
 * above the rig rather than the rig itself. Turning about a fixed +X axis
 * therefore tips a 1.0 face down and a 0.x face *up* — so the pitch flips with
 * the facing, while the yaw, being about the axis the two share, does not.
 *
 * @param faceFrontZ The z of the rig's face direction, `vrm.lookAt.faceFront`.
 */
export function rigTurnFor(
  yaw: number,
  pitch: number,
  faceFrontZ: number,
): RigTurn {
  return { yaw, pitch: faceFrontZ < 0 ? -pitch : pitch };
}

/**
 * How much of the cursor the character is taking in, from how far the cursor is
 * from the head in world units. Smoothstep rather than linear so attention
 * neither switches on at a hard edge nor lingers at a barely-there fraction out
 * at the rim.
 */
export function attentionForDistance(
  distance: number,
  settings: GazeSettings = DEFAULT_GAZE,
): number {
  const { nearRadius, farRadius } = settings;
  if (!Number.isFinite(distance)) return 0;
  // An inverted or empty range is answered before the near test, so a nonsense
  // pair reads as no attention rather than as attention everywhere.
  if (farRadius <= nearRadius) return 0;
  if (distance <= nearRadius) return 1;
  if (distance >= farRadius) return 0;
  const t = (distance - nearRadius) / (farRadius - nearRadius);
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Fraction of the remaining gap to close this frame. Derived from the elapsed
 * time rather than applied per frame, so the ease looks the same at 30Hz as at
 * 144Hz.
 */
export function smoothingFactor(
  delta: number,
  responseSeconds: number,
): number {
  if (!(delta > 0)) return 0;
  if (responseSeconds <= 0) return 1;
  return 1 - Math.exp(-delta / responseSeconds);
}

export interface GazeTarget {
  /** World distance from the head to the cursor; sets the attention. */
  distance: number;
  /** Angles to the cursor as three-vrm reports them, before limiting. */
  yaw: number;
  pitch: number;
}

/**
 * Advances the gaze toward the cursor, or back to rest when `target` is null —
 * the cursor left, a gesture took over, or the feature is off. Mutates and
 * returns `state`, which the render loop owns.
 *
 * The angles are limited before attention scales them, so a cursor far off to
 * one side asks for the same turn as one just outside the inner radius rather
 * than for an ever-growing one, and attention alone decides how much of that
 * turn is spent.
 */
export function advanceGaze(
  state: GazeState,
  target: GazeTarget | null,
  delta: number,
  settings: GazeSettings = DEFAULT_GAZE,
): GazeState {
  const factor = smoothingFactor(delta, settings.responseSeconds);
  let attention = 0;
  let yaw = 0;
  let pitch = 0;

  if (target && Number.isFinite(target.yaw) && Number.isFinite(target.pitch)) {
    attention = attentionForDistance(target.distance, settings);
    yaw = clamp(target.yaw, -settings.maxYaw, settings.maxYaw) * attention;
    pitch =
      clamp(target.pitch, -settings.maxPitch, settings.maxPitch) * attention;
  }

  state.attention += (attention - state.attention) * factor;
  state.yaw += (yaw - state.yaw) * factor;
  state.pitch += (pitch - state.pitch) * factor;
  return state;
}

/**
 * The tuning the character actually runs with: the defaults, with the few
 * values the user is offered laid over them. Everything else stays where it
 * was set, so a saved file can never leave the gaze in a shape nobody chose.
 */
export function gazeSettingsFor(
  saved: PersonaCursorGazeSettings | null | undefined,
): GazeSettings {
  if (!saved) return DEFAULT_GAZE;
  return {
    ...DEFAULT_GAZE,
    screenGain: saved.reaction_size,
    farRadius: saved.notice_radius,
    eyesOnlyChance: saved.eyes_only_chance,
  };
}

/** Whether the gaze has eased close enough to rest to stop touching the rig. */
export function isGazeAtRest(state: GazeState): boolean {
  return (
    Math.abs(state.attention) < 1e-3 &&
    Math.abs(state.yaw) < 1e-4 &&
    Math.abs(state.pitch) < 1e-4
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * How the turn is shared between the neck and the head. Weights sum to one and
 * are rescaled for a rig missing one of them, so a character with no neck bone
 * still turns by the full angle instead of a fraction of it.
 */
export const GAZE_BONE_WEIGHTS: readonly (readonly [string, number])[] = [
  ['neck', 0.4],
  ['head', 0.6],
];

export function gazeWeightsFor(
  present: readonly string[],
): readonly (readonly [string, number])[] {
  const found = GAZE_BONE_WEIGHTS.filter(([name]) => present.includes(name));
  const total = found.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return [];
  return found.map(([name, weight]) => [name, weight / total] as const);
}
