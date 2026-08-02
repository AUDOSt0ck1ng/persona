import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  configureAnimationAction,
  configureSpeakingChunkAction,
  fadeAnimationActionSet,
} from './animation-action';

function createAction(duration = 0.1) {
  const mixer = new THREE.AnimationMixer(new THREE.Object3D());
  const action = mixer.clipAction(new THREE.AnimationClip('test', duration));
  return { action, mixer };
}

describe('animation playback configuration', () => {
  it('finishes a one-shot action once and holds its final pose', () => {
    const { action, mixer } = createAction();
    let finishes = 0;
    mixer.addEventListener('finished', () => {
      finishes += 1;
    });

    configureAnimationAction(action, 'once').play();
    mixer.update(0.2);

    expect(finishes).toBe(1);
    expect(action.loop).toBe(THREE.LoopOnce);
    expect(action.clampWhenFinished).toBe(true);
  });

  it('keeps a selected speaking chunk moving without snapping back to its first frame', () => {
    const root = new THREE.Object3D();
    const clip = new THREE.AnimationClip('speaking', 1, [
      new THREE.VectorKeyframeTrack(
        '.position',
        [0, 1],
        [0, 0, 0, 1, 0, 0],
      ),
    ]);
    const mixer = new THREE.AnimationMixer(root);
    const action = mixer.clipAction(clip);

    configureSpeakingChunkAction(action).play();
    mixer.update(1.25);
    const firstPausedPose = root.position.x;
    mixer.update(0.25);

    expect(action.loop).toBe(THREE.LoopPingPong);
    expect(action.clampWhenFinished).toBe(false);
    expect(action.isRunning()).toBe(true);
    expect(firstPausedPose).toBeCloseTo(0.75, 5);
    expect(root.position.x).toBeCloseTo(0.5, 5);
  });

  it('keeps ordinary voice-driven body animations looping', () => {
    const { action, mixer } = createAction();
    let finishes = 0;
    mixer.addEventListener('finished', () => {
      finishes += 1;
    });

    configureAnimationAction(action, 'loop').play();
    mixer.update(0.2);

    expect(finishes).toBe(0);
    expect(action.loop).toBe(THREE.LoopRepeat);
    expect(action.clampWhenFinished).toBe(false);
  });

  it('interpolates outgoing and incoming action weights during replacement', () => {
    const mixer = new THREE.AnimationMixer(new THREE.Object3D());
    const previous = mixer.clipAction(
      new THREE.AnimationClip('previous', 2),
    );
    const next = mixer.clipAction(new THREE.AnimationClip('next', 2));
    previous.play();
    mixer.update(0.01);

    fadeAnimationActionSet([previous], next, 1);
    mixer.update(0.5);

    expect(previous.getEffectiveWeight()).toBeCloseTo(0.5, 1);
    expect(next.getEffectiveWeight()).toBeCloseTo(0.5, 1);

    mixer.update(0.5);
    expect(previous.getEffectiveWeight()).toBeCloseTo(0, 5);
    expect(next.getEffectiveWeight()).toBeCloseTo(1, 5);
  });

  it('fades both sides of an interrupted speaking blend without collapsing either pose', () => {
    const mixer = new THREE.AnimationMixer(new THREE.Object3D());
    const first = mixer.clipAction(new THREE.AnimationClip('first', 2));
    const second = mixer.clipAction(new THREE.AnimationClip('second', 2));
    const idle = mixer.clipAction(new THREE.AnimationClip('idle', 2));
    first.setEffectiveWeight(0.4).play();
    second.setEffectiveWeight(0.6).play();
    mixer.update(0.01);

    fadeAnimationActionSet([first, second], idle, 1);
    mixer.update(0.5);

    expect(first.getEffectiveWeight()).toBeCloseTo(0.2, 1);
    expect(second.getEffectiveWeight()).toBeCloseTo(0.3, 1);
    expect(idle.getEffectiveWeight()).toBeCloseTo(0.5, 1);
  });
});
