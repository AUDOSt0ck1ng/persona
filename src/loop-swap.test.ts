import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { PlayableAnimationType } from './animation-catalog';
import { createLoopSwapHandler, type LoopSelection } from './loop-swap';

function createHarness() {
  const mixer = new THREE.AnimationMixer(new THREE.Object3D());
  const initialAction = mixer.clipAction(new THREE.AnimationClip('a', 1));
  const current = { current: initialAction as THREE.AnimationAction | null };
  const requestGeneration = { current: 0 };
  const bodyTransitionSeconds = { current: 0.5 };
  const previousAnimation = new Map<PlayableAnimationType, string>();
  const activeLoopSelection: { current: LoopSelection | null } = {
    current: {
      type: 'IDLE',
      urls: ['a.vrma', 'b.vrma'],
      generation: 0,
      swapping: false,
    },
  };
  const fadeTo = vi.fn((next: THREE.AnimationAction) => {
    current.current = next;
  });

  return {
    mixer,
    initialAction,
    current,
    requestGeneration,
    bodyTransitionSeconds,
    previousAnimation,
    activeLoopSelection,
    fadeTo,
  };
}

describe('createLoopSwapHandler', () => {
  it('ignores re-entrant loop events while a swap is already loading', async () => {
    const harness = createHarness();
    let resolveLoad: (clip: THREE.AnimationClip) => void = () => {};
    const loadClip = vi.fn(
      () =>
        new Promise<THREE.AnimationClip>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const onLoadError = vi.fn();
    const handleLoop = createLoopSwapHandler({
      activeLoopSelection: harness.activeLoopSelection,
      current: harness.current,
      requestGeneration: harness.requestGeneration,
      mixer: { current: harness.mixer },
      previousAnimation: harness.previousAnimation,
      bodyTransitionSeconds: harness.bodyTransitionSeconds,
      loadClip,
      fadeTo: harness.fadeTo,
      onLoadError,
    });

    handleLoop({ action: harness.initialAction });
    handleLoop({ action: harness.initialAction });

    expect(loadClip).toHaveBeenCalledTimes(1);
    expect(harness.activeLoopSelection.current?.swapping).toBe(true);

    resolveLoad(new THREE.AnimationClip('b', 1));
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.fadeTo).toHaveBeenCalledTimes(1);
    expect(harness.activeLoopSelection.current?.swapping).toBe(false);
    expect(onLoadError).not.toHaveBeenCalled();
  });

  it('swaps to a different clip than the one currently playing', async () => {
    const harness = createHarness();
    harness.previousAnimation.set('IDLE', 'a.vrma');
    const nextClip = new THREE.AnimationClip('b', 1);
    const loadClip = vi.fn(async (url: string) => {
      expect(url).toBe('b.vrma');
      return nextClip;
    });

    const handleLoop = createLoopSwapHandler({
      activeLoopSelection: harness.activeLoopSelection,
      current: harness.current,
      requestGeneration: harness.requestGeneration,
      mixer: { current: harness.mixer },
      previousAnimation: harness.previousAnimation,
      bodyTransitionSeconds: harness.bodyTransitionSeconds,
      loadClip,
      fadeTo: harness.fadeTo,
      onLoadError: vi.fn(),
    });

    handleLoop({ action: harness.initialAction });
    await Promise.resolve();
    await Promise.resolve();

    expect(loadClip).toHaveBeenCalledWith('b.vrma');
    expect(harness.previousAnimation.get('IDLE')).toBe('b.vrma');
    expect(harness.current.current).not.toBe(harness.initialAction);
  });

  it('discards a swap that resolves after the action was interrupted', async () => {
    const harness = createHarness();
    let resolveLoad: (clip: THREE.AnimationClip) => void = () => {};
    const loadClip = vi.fn(
      () =>
        new Promise<THREE.AnimationClip>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const handleLoop = createLoopSwapHandler({
      activeLoopSelection: harness.activeLoopSelection,
      current: harness.current,
      requestGeneration: harness.requestGeneration,
      mixer: { current: harness.mixer },
      previousAnimation: harness.previousAnimation,
      bodyTransitionSeconds: harness.bodyTransitionSeconds,
      loadClip,
      fadeTo: harness.fadeTo,
      onLoadError: vi.fn(),
    });

    handleLoop({ action: harness.initialAction });

    // A new play() call interrupts the loop before the swap's clip loads.
    const interruptingAction = harness.mixer.clipAction(
      new THREE.AnimationClip('c', 1),
    );
    harness.current.current = interruptingAction;
    harness.requestGeneration.current += 1;

    resolveLoad(new THREE.AnimationClip('b', 1));
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.fadeTo).not.toHaveBeenCalled();
    expect(harness.current.current).toBe(interruptingAction);
    expect(harness.activeLoopSelection.current?.swapping).toBe(false);
  });

  it('resets swapping after a load failure so the next loop can retry', async () => {
    const harness = createHarness();
    const failure = new Error('missing file');
    const loadClip = vi
      .fn<() => Promise<THREE.AnimationClip>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(new THREE.AnimationClip('b', 1));
    const onLoadError = vi.fn();

    const handleLoop = createLoopSwapHandler({
      activeLoopSelection: harness.activeLoopSelection,
      current: harness.current,
      requestGeneration: harness.requestGeneration,
      mixer: { current: harness.mixer },
      previousAnimation: harness.previousAnimation,
      bodyTransitionSeconds: harness.bodyTransitionSeconds,
      loadClip,
      fadeTo: harness.fadeTo,
      onLoadError,
    });

    handleLoop({ action: harness.initialAction });
    await Promise.resolve();
    await Promise.resolve();

    expect(onLoadError).toHaveBeenCalledWith(failure);
    expect(harness.activeLoopSelection.current?.swapping).toBe(false);

    handleLoop({ action: harness.initialAction });
    await Promise.resolve();
    await Promise.resolve();

    expect(loadClip).toHaveBeenCalledTimes(2);
    expect(harness.fadeTo).toHaveBeenCalledTimes(1);
  });

  it('does nothing when only one animation url is available', () => {
    const harness = createHarness();
    if (harness.activeLoopSelection.current) {
      harness.activeLoopSelection.current.urls = ['a.vrma'];
    }
    const loadClip = vi.fn();

    const handleLoop = createLoopSwapHandler({
      activeLoopSelection: harness.activeLoopSelection,
      current: harness.current,
      requestGeneration: harness.requestGeneration,
      mixer: { current: harness.mixer },
      previousAnimation: harness.previousAnimation,
      bodyTransitionSeconds: harness.bodyTransitionSeconds,
      loadClip,
      fadeTo: harness.fadeTo,
      onLoadError: vi.fn(),
    });

    handleLoop({ action: harness.initialAction });

    expect(loadClip).not.toHaveBeenCalled();
  });
});
