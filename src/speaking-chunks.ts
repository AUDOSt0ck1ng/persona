import type { AnimationPlayback } from './animation-action';
import {
  randomAnimationUrl,
  type PlayableAnimationType,
} from './animation-catalog';

export const SPEAKING_CHUNK_BASE_SECONDS = 0.9;
// Provisional developer default; tune this after real voice-session testing.
export const DEFAULT_BODY_TRANSITION_SECONDS = 0.35;
export const DEFAULT_SPEAKING_TRANSITION: PersonaSpeakingTransitionSettings = {
  entry_factor: [1.5, 1.8],
  exit_factor: [1.5, 1.8],
};

function randomFactor(
  [minimum, maximum]: readonly [number, number],
  random: () => number,
): number {
  const unit = Math.min(1, Math.max(0, random()));
  return minimum + (maximum - minimum) * unit;
}

export function speakingChunkBlendWeights(
  elapsedSeconds: number,
  entryDurationSeconds: number,
  exitDurationSeconds: number,
): { incoming: number; outgoing: number } {
  const entryDuration = Math.max(Number.EPSILON, entryDurationSeconds);
  const exitDuration = Math.max(Number.EPSILON, exitDurationSeconds);
  const elapsed = Math.max(0, elapsedSeconds);
  const incoming =
    elapsed < entryDuration
      ? 0.5 * Math.min(1, elapsed / entryDuration)
      : 0.5 +
        0.5 * Math.min(1, (elapsed - entryDuration) / exitDuration);
  return { incoming, outgoing: 1 - incoming };
}

export function speakingChunkTransitionDurations(
  settings: PersonaSpeakingTransitionSettings,
  random: () => number = Math.random,
): { entry: number; exit: number; total: number } {
  const halfBaseDuration = SPEAKING_CHUNK_BASE_SECONDS / 2;
  const entry = halfBaseDuration * randomFactor(settings.entry_factor, random);
  const exit = halfBaseDuration * randomFactor(settings.exit_factor, random);
  return { entry, exit, total: entry + exit };
}

export function speakingChunkSequenceUrls(
  type: PlayableAnimationType,
  playback: AnimationPlayback,
  animationUrls: readonly string[],
): string[] | null {
  const uniqueUrls = [...new Set(animationUrls)];
  return type === 'TALK' && playback === 'loop' && uniqueUrls.length > 1
    ? uniqueUrls
    : null;
}

export function nextSpeakingChunkUrl(
  animationUrls: readonly string[],
  previousUrl: string | null,
  failedUrls: ReadonlySet<string> = new Set(),
  random: () => number = Math.random,
): string | null {
  return randomAnimationUrl(
    animationUrls.filter((url) => !failedUrls.has(url)),
    previousUrl,
    random,
  );
}

export function shouldAdvanceSpeakingSequence({
  actionDuration,
  actionTime,
  mixerTime,
  nextTransitionAt,
  speakingActive,
  transitionDuration,
}: {
  actionDuration: number;
  actionTime: number;
  mixerTime: number;
  nextTransitionAt: number;
  speakingActive: boolean;
  transitionDuration: number;
}): boolean {
  return (
    speakingActive &&
    mixerTime >= nextTransitionAt &&
    actionTime >= actionDuration - transitionDuration
  );
}
