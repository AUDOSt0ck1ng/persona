import * as THREE from 'three';

export type AnimationPlayback = 'loop' | 'once';

export function configureAnimationAction(
  action: THREE.AnimationAction,
  playback: AnimationPlayback,
): THREE.AnimationAction {
  if (playback === 'once') {
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
  } else {
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
  }
  return action;
}

export function fadeAnimationActionSet(
  outgoingActions: Iterable<THREE.AnimationAction>,
  next: THREE.AnimationAction,
  duration: number,
): Set<THREE.AnimationAction> {
  const fading = new Set(outgoingActions);
  fading.delete(next);
  for (const action of fading) {
    action.stopFading().fadeOut(duration);
  }
  next.stopFading().setEffectiveWeight(1).fadeIn(duration).play();
  return fading;
}
