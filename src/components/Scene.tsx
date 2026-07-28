import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Avatar } from './Avatar';
import type { AnimationType } from '../animation-catalog';

interface SceneProps {
  animation: AnimationType;
  audioLevel: number;
  speaking: boolean;
}

export function Scene(props: SceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 2, 4.8], fov: 20 }}
      dpr={[1, 1.5]}
      gl={{
        alpha: true,
        antialias: true,
        outputColorSpace: THREE.SRGBColorSpace,
        toneMapping: THREE.ACESFilmicToneMapping,
      }}
    >
      <ambientLight intensity={1.3} color="#9aa8ff" />
      <directionalLight position={[-3, 4, 4]} intensity={3.2} color="#ffffff" />
      <directionalLight position={[3, 2, -2]} intensity={2.2} color="#8a5cff" />
      <Avatar {...props} />
      <OrbitControls
        makeDefault
        target={[0, 1, 0]}
        enableDamping
        dampingFactor={0.08}
        enablePan
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
