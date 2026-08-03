import * as THREE from 'three';
import { randomAnimationUrl, type PlayableAnimationType } from './animation-catalog';
import { configureAnimationAction } from './animation-action';

export interface LoopSelection {
  type: PlayableAnimationType;
  urls: readonly string[];
  generation: number;
  swapping: boolean;
}

export interface CreateLoopSwapHandlerOptions {
  activeLoopSelection: { current: LoopSelection | null };
  current: { current: THREE.AnimationAction | null };
  requestGeneration: { current: number };
  mixer: { current: THREE.AnimationMixer | null };
  previousAnimation: Map<PlayableAnimationType, string>;
  bodyTransitionSeconds: { current: number };
  loadClip: (url: string) => Promise<THREE.AnimationClip>;
  fadeTo: (next: THREE.AnimationAction, duration: number) => void;
  onLoadError: (error: unknown) => void;
}

// Re-randomizes a looping action's clip every time the mixer wraps it, so a
// body-idle loop doesn't visibly repeat the same clip forever. `swapping`
// guards against the mixer firing 'loop' again for the same action while a
// previous pick's clip is still loading.
export function createLoopSwapHandler(
  options: CreateLoopSwapHandlerOptions,
): (event: { action: THREE.AnimationAction }) => void {
  return ({ action }) => {
    const selection = options.activeLoopSelection.current;
    if (
      !selection ||
      action !== options.current.current ||
      selection.generation !== options.requestGeneration.current ||
      selection.urls.length < 2 ||
      selection.swapping
    ) {
      return;
    }
    const nextUrl = randomAnimationUrl(
      selection.urls,
      options.previousAnimation.get(selection.type) ?? null,
    );
    if (!nextUrl) return;
    selection.swapping = true;
    options.previousAnimation.set(selection.type, nextUrl);
    void options
      .loadClip(nextUrl)
      .then((clip) => {
        selection.swapping = false;
        if (
          selection.generation !== options.requestGeneration.current ||
          !options.mixer.current ||
          options.current.current !== action
        ) {
          return;
        }
        const nextAction = options.mixer.current.clipAction(clip);
        nextAction.reset();
        configureAnimationAction(nextAction, 'loop');
        options.fadeTo(nextAction, options.bodyTransitionSeconds.current);
        options.current.current = nextAction;
      })
      .catch((error: unknown) => {
        selection.swapping = false;
        options.onLoadError(error);
      });
  };
}
