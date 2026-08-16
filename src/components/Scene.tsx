import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import {
  ContactShadows,
  Environment,
  OrbitControls,
} from '@react-three/drei';
import dawnEnvironment from '@pmndrs/assets/hdri/dawn.exr';
import * as THREE from 'three';
import { Avatar } from './Avatar';
import type { PlayableAnimationType } from '../animation-catalog';
import { calculateFullBodyFraming } from '../camera-framing';
import { drawingBufferPixel, passthroughForAlpha } from '../click-through';
import type { DragInertiaState } from '../drag-inertia';
import { resolveLightingSettings } from '../settings-defaults';

interface SceneProps {
  animation: PlayableAnimationType;
  animationRequest: number;
  animationUrls?: readonly string[];
  fallbackAnimationUrls?: readonly string[];
  preloadAnimationUrls?: readonly string[];
  expressionName?: PersonaExpressionName | null;
  expressionWeight?: number;
  audioLevel: number;
  bodySpeaking: boolean;
  onExpressionsChange?: (
    modelUrl: string,
    expressions: readonly string[],
  ) => void;
  characterSize: number;
  dragInertia?: DragInertiaState;
  enablePan?: boolean;
  framingMargin?: number;
  groundShadow?: boolean;
  lighting?: PersonaLightingSettings;
  modelUrl: string;
  onAnimationComplete: () => void;
  playback: 'loop' | 'once';
  speaking: boolean;
  bodyTransitionMs: number;
  speakingDebounceMs: number;
  idleInterimMs: number;
  speakingTransition: PersonaSpeakingTransitionSettings;
  silhouetteHitTest?: boolean;
}

interface TargetControls {
  target: THREE.Vector3;
  update: () => void;
}

interface Grounding {
  far: number;
  position: [number, number, number];
  scale: number;
}

function supportsTarget(controls: unknown): controls is TargetControls {
  if (!controls || typeof controls !== 'object') return false;
  const candidate = controls as Partial<TargetControls>;
  return candidate.target instanceof THREE.Vector3 &&
    typeof candidate.update === 'function';
}

function LightingController({
  lighting,
}: {
  lighting: PersonaLightingSettings;
}) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    gl.toneMapping =
      lighting.tone_mapping === 'aces'
        ? THREE.ACESFilmicToneMapping
        : THREE.NoToneMapping;
    gl.toneMappingExposure = lighting.exposure;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    // eslint-disable-next-line react-hooks/immutability
    scene.environmentIntensity = lighting.environment_enabled
      ? lighting.environment_intensity
      : 0;
  }, [
    gl,
    scene,
    lighting.tone_mapping,
    lighting.exposure,
    lighting.environment_enabled,
    lighting.environment_intensity,
  ]);

  return null;
}

function FullBodyCamera({
  characterSize,
  framingMargin,
  object,
}: {
  characterSize: number;
  framingMargin: number;
  object: THREE.Object3D | null;
}) {
  const getThreeState = useThree((state) => state.get);
  const controlsReady = useThree((state) => Boolean(state.controls));
  const framedObject = useRef<THREE.Object3D | null>(null);
  const framedCharacterSize = useRef<number | null>(null);
  const framedMargin = useRef<number | null>(null);

  useLayoutEffect(() => {
    const { camera, controls } = getThreeState();
    if (
      !object ||
      (framedObject.current === object &&
        framedCharacterSize.current === characterSize &&
        framedMargin.current === framingMargin) ||
      !(camera instanceof THREE.PerspectiveCamera) ||
      !supportsTarget(controls)
    ) {
      return;
    }

    object.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;

    const framing = calculateFullBodyFraming(
      box,
      camera.fov,
      camera.aspect,
      framingMargin,
      1.5 * characterSize,
    );
    camera.position.copy(framing.position);
    camera.near = Math.max(0.01, framing.distance / 100);
    camera.far = Math.max(100, framing.distance * 100);
    camera.lookAt(framing.target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    controls.target.copy(framing.target);
    controls.update();
    framedObject.current = object;
    framedCharacterSize.current = characterSize;
    framedMargin.current = framingMargin;
  }, [characterSize, controlsReady, framingMargin, getThreeState, object]);

  return null;
}

/**
 * Keeps the avatar window click-through everywhere except over the character.
 * While the window ignores the mouse Electron still forwards mousemove, so this
 * samples the alpha the frame already drew under the cursor and hands input
 * back only where the character is actually visible.
 *
 * Alpha rather than a raycast: the rig is ~29k skinned triangles, and three.js
 * transforms every vertex by its bones on the CPU for each cast, which costs
 * far more than a frame. Reading one pixel is independent of model complexity,
 * and is truer to what the user sees, since alpha-cut hair reads as the
 * background it looks like instead of as the quad it is drawn on.
 */
function PassthroughController({ enabled }: { enabled: boolean }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const bridge = window.personaBridge;
    if (!bridge?.setMousePassthrough) return;

    // Say nothing until the main process reports the mode, so a renderer that
    // has not heard yet cannot contradict the flags the window already has.
    if (!enabled) return;

    const canvas = gl.domElement;
    const context = gl.getContext();
    const sample = new Uint8Array(4);
    let passthrough = true;
    // Only a press this window received. A button held from a gesture that
    // began on the desktop is still forwarded here while the window ignores the
    // mouse, and must not make the window grab what it started on.
    let gestureActive = false;
    let clientX = 0;
    let clientY = 0;
    let pending = false;

    const apply = (next: boolean) => {
      if (next === passthrough) return;
      passthrough = next;
      bridge.setMousePassthrough(next);
    };

    // The drawing buffer only holds this frame's pixels until it is handed to
    // the compositor, so the sample has to be taken inside the render rather
    // than from the event that asked for it.
    const previous = scene.onAfterRender;
    // eslint-disable-next-line react-hooks/immutability
    scene.onAfterRender = function afterRender(...args) {
      previous.apply(this, args);
      if (!pending) return;
      // A render into an offscreen target is not the frame the user sees.
      if (gl.getRenderTarget() !== null) return;
      pending = false;
      const pixel = drawingBufferPixel(
        canvas.getBoundingClientRect(),
        { width: canvas.width, height: canvas.height },
        clientX,
        clientY,
      );
      if (!pixel) {
        // A drag can carry the cursor off the window, and there is no pixel to
        // read out there. Nothing outside the canvas is ever drawn, so decide
        // rather than leave the last decision standing.
        apply(!gestureActive);
        return;
      }
      context.readPixels(
        pixel.x,
        pixel.y,
        1,
        1,
        context.RGBA,
        context.UNSIGNED_BYTE,
        sample,
      );
      apply(passthroughForAlpha({ alpha: sample[3], gestureActive }));
    };

    // Pointer events, not mouse events: useWindowDrag cancels `pointerdown` for
    // Alt+drag, which suppresses the compatibility mouse events afterwards, and
    // sampling would then stop until an unrelated click revived it. Captured on
    // window so the same hook's stopPropagation cannot hide them either.
    const onPointerDown = () => {
      gestureActive = true;
      apply(false);
    };
    // A release can land outside the window with no pointerup ever arriving,
    // the hazard useWindowDrag documents, so the button mask ends the gesture
    // too rather than trusting the release alone.
    const onPointerMove = (event: PointerEvent) => {
      clientX = event.clientX;
      clientY = event.clientY;
      if (event.buttons === 0) gestureActive = false;
      pending = true;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.buttons === 0) gestureActive = false;
      // Re-sample at the release point instead of waiting for a move, so a drag
      // that ends over a transparent gap gives the desktop back at once.
      pending = true;
    };

    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('pointermove', onPointerMove, { capture: true });
    window.addEventListener('pointerup', onPointerUp, { capture: true });
    // Match the window's initial ignoring state set by the main process.
    bridge.setMousePassthrough(true);

    return () => {
      scene.onAfterRender = previous;
      window.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('pointermove', onPointerMove, { capture: true });
      window.removeEventListener('pointerup', onPointerUp, { capture: true });
      // Leave the window interactive so a later mount is never stuck ignoring.
      bridge.setMousePassthrough(false);
    };
  }, [enabled, gl, scene]);

  return null;
}

export function Scene(props: SceneProps) {
  const lighting = resolveLightingSettings(props.lighting);
  const [avatarScene, setAvatarScene] = useState<THREE.Object3D | null>(null);
  const [grounding, setGrounding] = useState<Grounding | null>(null);
  const handleAvatarReady = useCallback((scene: THREE.Object3D) => {
    setAvatarScene(scene);
    scene.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(scene);
    if (box.isEmpty()) {
      setGrounding(null);
      return;
    }
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    setGrounding({
      far: Math.max(size.y, 1),
      position: [center.x, box.min.y + 0.005, center.z],
      scale: Math.max(size.x, size.z, 0.8) * 1.8,
    });
  }, []);

  return (
    <Canvas
      camera={{ position: [0, 2, 4.8], fov: 20 }}
      dpr={[1, 1.5]}
      gl={{
        antialias: true,
        alpha: true,
        toneMapping: lighting.tone_mapping === 'aces'
          ? THREE.ACESFilmicToneMapping
          : THREE.NoToneMapping,
        toneMappingExposure: lighting.exposure,
        outputColorSpace: THREE.SRGBColorSpace,
      }}
      style={{ background: 'transparent' }}
    >
      <LightingController lighting={lighting} />
      <directionalLight
        color={[1, 1, 1]}
        position={[-3, 3, 3]}
        intensity={lighting.key_light_intensity}
      />
      <ambientLight
        color={[
          0.0036765073221525194,
          0.0036765073221525194,
          0.0036765073221525194,
        ]}
        intensity={lighting.ambient_intensity}
      />
      {lighting.environment_enabled && (
        <Environment files={dawnEnvironment} />
      )}
      <FullBodyCamera
        characterSize={props.characterSize}
        framingMargin={props.framingMargin ?? 1.12}
        object={avatarScene}
      />
      <Avatar {...props} onReady={handleAvatarReady} />
      <PassthroughController enabled={props.silhouetteHitTest ?? false} />
      {props.groundShadow && grounding && (
        <ContactShadows
          blur={2.4}
          color="#050506"
          far={grounding.far}
          frames={1}
          key={`${props.modelUrl}-ground-shadow`}
          opacity={0.42}
          position={grounding.position}
          resolution={256}
          scale={grounding.scale}
        />
      )}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enablePan={props.enablePan ?? true}
        enableZoom
        minDistance={1.4}
        maxDistance={12}
        panSpeed={0.7}
        rotateSpeed={0.45}
        screenSpacePanning
        zoomSpeed={0.8}
      />
    </Canvas>
  );
}
