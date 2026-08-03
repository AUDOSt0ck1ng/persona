import { useCallback, useEffect, useRef } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  VRMAnimationLoaderPlugin,
  createVRMAnimationClip,
  type VRMAnimation,
} from '@pixiv/three-vrm-animation';
import type { VRM } from '@pixiv/three-vrm';
import * as THREE from 'three';
import {
  randomAnimationUrl,
  type PlayableAnimationType,
} from '../animation-catalog';
import {
  configureAnimationAction,
  configureSpeakingChunkAction,
  fadeAnimationActionSet,
  type AnimationPlayback,
} from '../animation-action';
import {
  nextSpeakingChunkUrl,
  holdSpeakingChunkAfterResume,
  speakingChunkDwellSeconds,
  speakingChunkBlendWeights,
  speakingChunkSequenceUrls,
  speakingChunkTransitionDurations,
  shouldAdvanceSpeakingSequence,
} from '../speaking-chunks';
import { createLoopSwapHandler } from '../loop-swap';

interface PlayOptions {
  animationUrls?: readonly string[];
  onComplete?: () => void;
  playback?: AnimationPlayback;
}

interface PendingCompletion {
  action: THREE.AnimationAction;
  callback: () => void;
  generation: number;
}

interface SpeakingSequence {
  action: THREE.AnimationAction | null;
  advancing: boolean;
  animationUrls: string[];
  failedUrls: Set<string>;
  generation: number;
  nextTransitionAt: number;
  previousUrl: string | null;
}

interface SpeakingBlend {
  duration: number;
  entryDuration: number;
  exitDuration: number;
  incoming: THREE.AnimationAction;
  outgoing: THREE.AnimationAction;
  startedAt: number;
}

export function useVrmAnimation(
  vrm: VRM | null,
  speakingTransition: PersonaSpeakingTransitionSettings,
  bodyTransitionSeconds: number,
  speakingActive: boolean,
) {
  const mixer = useRef<THREE.AnimationMixer | null>(null);
  const current = useRef<THREE.AnimationAction | null>(null);
  const currentType = useRef<PlayableAnimationType | null>(null);
  const cache = useRef(new Map<string, VRMAnimation>());
  const clipCache = useRef(
    new WeakMap<VRM, Map<string, THREE.AnimationClip>>(),
  );
  const previousAnimation = useRef(
    new Map<PlayableAnimationType, string>(),
  );
  const requestGeneration = useRef(0);
  const pendingCompletion = useRef<PendingCompletion | null>(null);
  const speakingSequence = useRef<SpeakingSequence | null>(null);
  const speakingBlend = useRef<SpeakingBlend | null>(null);
  const activeLoopSelection = useRef<{
    type: PlayableAnimationType;
    urls: readonly string[];
    generation: number;
    swapping: boolean;
  } | null>(null);
  const fadingActions = useRef(new Set<THREE.AnimationAction>());
  const pendingTransitionActions = useRef<THREE.AnimationAction[]>([]);
  const speakingTransitionRef = useRef(speakingTransition);
  const bodyTransitionSecondsRef = useRef(bodyTransitionSeconds);
  const speakingActiveRef = useRef(speakingActive);
  const speakingWasActive = useRef(speakingActive);
  speakingTransitionRef.current = speakingTransition;
  bodyTransitionSecondsRef.current = bodyTransitionSeconds;
  speakingActiveRef.current = speakingActive;

  const load = useCallback(async (url: string) => {
    const cached = cache.current.get(url);
    if (cached) return cached;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url);
    const animation = gltf.userData.vrmAnimations?.[0] as VRMAnimation | undefined;
    if (!animation) throw new Error(`No VRM animation found in ${url}`);
    cache.current.set(url, animation);
    return animation;
  }, []);

  const loadClip = useCallback(
    async (url: string) => {
      if (!vrm) throw new Error('A VRM model is required to load an animation.');
      let clips = clipCache.current.get(vrm);
      if (!clips) {
        clips = new Map();
        clipCache.current.set(vrm, clips);
      }
      const cached = clips.get(url);
      if (cached) return cached;
      const animation = await load(url);
      const clip = createVRMAnimationClip(animation, vrm);
      clips.set(url, clip);
      return clip;
    },
    [load, vrm],
  );

  const fadeTo = useCallback(
    (
      next: THREE.AnimationAction,
      duration: number,
      additionalOutgoing: readonly THREE.AnimationAction[] = [],
    ) => {
      const outgoing = new Set([
        ...fadingActions.current,
        ...additionalOutgoing,
      ]);
      if (current.current) outgoing.add(current.current);
      const fading = fadeAnimationActionSet(outgoing, next, duration);
      for (const action of fading) fadingActions.current.add(action);
      fadingActions.current.delete(next);
    },
    [],
  );

  useEffect(() => {
    if (!vrm) return;
    const animationHistory = previousAnimation.current;
    const fadingActionSet = fadingActions.current;
    const animationMixer = new THREE.AnimationMixer(vrm.scene);
    const handleFinished = ({ action }: { action: THREE.AnimationAction }) => {
      const pending = pendingCompletion.current;
      if (
        pending?.action !== action ||
        pending.generation !== requestGeneration.current
      ) {
        return;
      }
      pendingCompletion.current = null;
      pending.callback();
    };
    const handleLoop = createLoopSwapHandler({
      activeLoopSelection,
      current,
      requestGeneration,
      mixer,
      previousAnimation: previousAnimation.current,
      bodyTransitionSeconds: bodyTransitionSecondsRef,
      loadClip,
      fadeTo,
      onLoadError: (error) =>
        console.warn('[persona] animation load failed', error),
    });
    animationMixer.addEventListener('finished', handleFinished);
    animationMixer.addEventListener('loop', handleLoop);
    mixer.current = animationMixer;
    return () => {
      animationMixer.removeEventListener('finished', handleFinished);
      animationMixer.removeEventListener('loop', handleLoop);
      animationMixer.stopAllAction();
      mixer.current = null;
      current.current = null;
      currentType.current = null;
      pendingCompletion.current = null;
      speakingSequence.current = null;
      speakingBlend.current = null;
      activeLoopSelection.current = null;
      fadingActionSet.clear();
      pendingTransitionActions.current = [];
      speakingWasActive.current = speakingActiveRef.current;
      animationHistory.clear();
    };
  }, [vrm, loadClip, fadeTo]);

  const advanceSpeakingSequence = useCallback(
    async function advance(generation: number): Promise<void> {
      const sequence = speakingSequence.current;
      if (
        !vrm ||
        !mixer.current ||
        !sequence ||
        sequence.generation !== generation ||
        sequence.advancing
      ) {
        return;
      }
      const url = nextSpeakingChunkUrl(
        sequence.animationUrls,
        sequence.previousUrl,
        sequence.failedUrls,
      );
      if (!url) return;
      sequence.advancing = true;
      try {
        const clip = await loadClip(url);
        const active = speakingSequence.current;
        if (
          requestGeneration.current !== generation ||
          active !== sequence ||
          !mixer.current
        ) {
          return;
        }
        const action = mixer.current.clipAction(clip);
        const speakingDurations = speakingChunkTransitionDurations(
          speakingTransitionRef.current,
        );
        const pendingActions = pendingTransitionActions.current;
        const fadeSeconds =
          pendingActions.length > 0 || currentType.current !== 'TALK'
            ? bodyTransitionSecondsRef.current
            : speakingDurations.total;
        action.reset();
        configureSpeakingChunkAction(action);
        if (pendingActions.length > 0) {
          fadeTo(action, fadeSeconds, pendingActions);
          pendingTransitionActions.current = [];
        } else if (current.current === action) {
          action.setEffectiveWeight(1).play();
        } else if (currentType.current === 'TALK' && current.current) {
          current.current.stopFading().setEffectiveWeight(1);
          action.stopFading().setEffectiveWeight(0).play();
          speakingBlend.current = {
            duration: speakingDurations.total,
            entryDuration: speakingDurations.entry,
            exitDuration: speakingDurations.exit,
            incoming: action,
            outgoing: current.current,
            startedAt: mixer.current.time,
          };
        } else {
          fadeTo(action, fadeSeconds);
        }
        current.current = action;
        currentType.current = 'TALK';
        sequence.action = action;
        sequence.nextTransitionAt =
          mixer.current.time +
          speakingChunkDwellSeconds(
            clip.duration,
            speakingDurations.total,
          );
        sequence.previousUrl = url;
        previousAnimation.current.set('TALK', url);
        sequence.advancing = false;
        void Promise.allSettled(
          sequence.animationUrls
            .filter((candidate) => candidate !== url)
            .map(loadClip),
        );
      } catch (error) {
        console.warn('[persona] speaking chunk load failed', error);
        sequence.failedUrls.add(url);
        sequence.advancing = false;
        if (sequence.failedUrls.size < sequence.animationUrls.length) {
          void advance(generation);
        }
      }
    },
    [fadeTo, loadClip, vrm],
  );

  const play = useCallback(
    async (
      type: PlayableAnimationType,
      {
        animationUrls = [],
        onComplete,
        playback = 'loop',
      }: PlayOptions = {},
    ) => {
      if (!vrm || !mixer.current) {
        if (playback === 'once') onComplete?.();
        return;
      }
      const generation = ++requestGeneration.current;
      pendingCompletion.current = null;
      speakingSequence.current = null;
      activeLoopSelection.current = null;
      const interruptedBlend = speakingBlend.current;
      if (interruptedBlend) {
        pendingTransitionActions.current = [
          ...new Set([
            ...pendingTransitionActions.current,
            interruptedBlend.outgoing,
            interruptedBlend.incoming,
          ]),
        ];
      }
      speakingBlend.current = null;
      try {
        const sequenceUrls = speakingChunkSequenceUrls(
          type,
          playback,
          animationUrls,
        );
        if (sequenceUrls) {
          speakingSequence.current = {
            action: null,
            advancing: false,
            animationUrls: sequenceUrls,
            failedUrls: new Set(),
            generation,
            nextTransitionAt: 0,
            previousUrl: previousAnimation.current.get(type) ?? null,
          };
          await advanceSpeakingSequence(generation);
          return;
        }
        const uniqueAnimationUrls = [...new Set(animationUrls)];
        const url = randomAnimationUrl(
          uniqueAnimationUrls,
          previousAnimation.current.get(type) ?? null,
        );
        if (!url) {
          const fadeSeconds = bodyTransitionSecondsRef.current;
          const outgoing = new Set([
            ...fadingActions.current,
            ...pendingTransitionActions.current,
          ]);
          if (current.current) outgoing.add(current.current);
          for (const action of outgoing) {
            action.stopFading().fadeOut(fadeSeconds);
            fadingActions.current.add(action);
          }
          pendingTransitionActions.current = [];
          current.current = null;
          currentType.current = type;
          if (playback === 'once') onComplete?.();
          return;
        }
        previousAnimation.current.set(type, url);
        const clip = await loadClip(url);
        if (generation !== requestGeneration.current || !mixer.current) return;
        const action = mixer.current.clipAction(clip);
        const fadeSeconds = bodyTransitionSecondsRef.current;
        action.reset();
        configureAnimationAction(action, playback);
        if (playback === 'loop') {
          activeLoopSelection.current = {
            type,
            urls: uniqueAnimationUrls,
            generation,
            swapping: false,
          };
        }
        if (playback === 'once') {
          if (onComplete) {
            pendingCompletion.current = {
              action,
              callback: onComplete,
              generation,
            };
          }
        }
        fadeTo(action, fadeSeconds, pendingTransitionActions.current);
        pendingTransitionActions.current = [];
        current.current = action;
        currentType.current = type;
      } catch (error) {
        console.warn('[persona] animation load failed', error);
        if (generation === requestGeneration.current && playback === 'once') {
          onComplete?.();
        }
      }
    },
    [advanceSpeakingSequence, fadeTo, loadClip, vrm],
  );

  const update = useCallback(
    (delta: number) => {
      mixer.current?.update(delta);
      const blend = speakingBlend.current;
      if (blend && mixer.current) {
        const elapsed = mixer.current.time - blend.startedAt;
        const weights = speakingChunkBlendWeights(
          elapsed,
          blend.entryDuration,
          blend.exitDuration,
        );
        blend.outgoing.setEffectiveWeight(weights.outgoing);
        blend.incoming.setEffectiveWeight(weights.incoming);
        if (elapsed >= blend.duration) {
          blend.outgoing.stop();
          blend.incoming.setEffectiveWeight(1);
          speakingBlend.current = null;
        }
      }
      const sequence = speakingSequence.current;
      const speakingIsActive = speakingActiveRef.current;
      if (speakingIsActive !== speakingWasActive.current) {
        if (speakingIsActive && sequence && mixer.current) {
          sequence.nextTransitionAt = holdSpeakingChunkAfterResume(
            sequence.nextTransitionAt,
            mixer.current.time,
          );
        }
        speakingWasActive.current = speakingIsActive;
      }
      if (
        sequence?.action &&
        !sequence.advancing &&
        shouldAdvanceSpeakingSequence({
          mixerTime: mixer.current?.time ?? 0,
          nextTransitionAt: sequence.nextTransitionAt,
          speakingActive: speakingIsActive,
        })
      ) {
        void advanceSpeakingSequence(sequence.generation);
      }
      for (const action of fadingActions.current) {
        if (action.getEffectiveWeight() <= 0.001) {
          action.stop();
          fadingActions.current.delete(action);
        }
      }
    },
    [advanceSpeakingSequence],
  );
  return { play, update };
}
