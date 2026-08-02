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
  crossFadeAnimationActions,
  type AnimationPlayback,
} from '../animation-action';
import {
  nextSpeakingChunkUrl,
  speakingChunkBlendWeights,
  speakingChunkSequenceUrls,
  speakingChunkTransitionDurations,
} from '../speaking-chunks';

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
  transitionDuration: number;
}

interface SpeakingBlend {
  duration: number;
  entryDuration: number;
  exitDuration: number;
  incoming: THREE.AnimationAction;
  outgoing: THREE.AnimationAction;
  startedAt: number;
}

function transitionSeconds(
  previous: PlayableAnimationType | null,
  next: PlayableAnimationType,
): number {
  if (previous === 'TALK' && next === 'IDLE') return 1.15;
  if (next === 'TALK') return 0.85;
  return 0.7;
}

export function useVrmAnimation(
  vrm: VRM | null,
  speakingTransition: PersonaSpeakingTransitionSettings,
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
  const speakingTransitionRef = useRef(speakingTransition);
  speakingTransitionRef.current = speakingTransition;

  useEffect(() => {
    if (!vrm) return;
    const animationHistory = previousAnimation.current;
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
    animationMixer.addEventListener('finished', handleFinished);
    mixer.current = animationMixer;
    return () => {
      animationMixer.removeEventListener('finished', handleFinished);
      animationMixer.stopAllAction();
      mixer.current = null;
      current.current = null;
      currentType.current = null;
      pendingCompletion.current = null;
      speakingSequence.current = null;
      speakingBlend.current = null;
      animationHistory.clear();
    };
  }, [vrm]);

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
        const fadeSeconds =
          currentType.current === 'TALK'
            ? speakingDurations.total
            : transitionSeconds(currentType.current, 'TALK');
        action.reset();
        configureAnimationAction(action, 'once');
        if (current.current === action) {
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
          crossFadeAnimationActions(current.current, action, fadeSeconds);
        }
        current.current = action;
        currentType.current = 'TALK';
        sequence.action = action;
        sequence.nextTransitionAt = mixer.current.time + fadeSeconds;
        sequence.transitionDuration = speakingDurations.total;
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
    [loadClip, vrm],
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
      const activeBlend = speakingBlend.current;
      if (activeBlend) {
        activeBlend.outgoing.stop();
        activeBlend.incoming.stopFading().setEffectiveWeight(1);
        current.current = activeBlend.incoming;
        speakingBlend.current = null;
      }
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
            transitionDuration: speakingChunkTransitionDurations(
              speakingTransitionRef.current,
            ).total,
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
          const fadeSeconds = transitionSeconds(currentType.current, type);
          current.current?.fadeOut(fadeSeconds);
          current.current = null;
          currentType.current = type;
          if (playback === 'once') onComplete?.();
          return;
        }
        previousAnimation.current.set(type, url);
        const clip = await loadClip(url);
        if (generation !== requestGeneration.current || !mixer.current) return;
        const action = mixer.current.clipAction(clip);
        const fadeSeconds = transitionSeconds(currentType.current, type);
        action.reset();
        configureAnimationAction(action, playback);
        if (playback === 'once') {
          if (onComplete) {
            pendingCompletion.current = {
              action,
              callback: onComplete,
              generation,
            };
          }
        }
        crossFadeAnimationActions(current.current, action, fadeSeconds);
        current.current = action;
        currentType.current = type;
      } catch (error) {
        console.warn('[persona] animation load failed', error);
        if (generation === requestGeneration.current && playback === 'once') {
          onComplete?.();
        }
      }
    },
    [advanceSpeakingSequence, loadClip, vrm],
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
      if (
        sequence?.action &&
        !sequence.advancing &&
        (mixer.current?.time ?? 0) >= sequence.nextTransitionAt &&
          sequence.action.time >=
          sequence.action.getClip().duration -
            sequence.transitionDuration
      ) {
        void advanceSpeakingSequence(sequence.generation);
      }
    },
    [advanceSpeakingSequence],
  );
  return { play, update };
}
