import { Suspense, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useVrmLoader } from '../hooks/useVrmLoader';
import { useVrmAnimation } from '../hooks/useVrmAnimation';
import { useAmplitudeLipSync } from '../hooks/useAmplitudeLipSync';
import { useBlink } from '../hooks/useBlink';
import type { AnimationType } from '../animation-catalog';

interface AvatarProps {
  animation: AnimationType;
  audioLevel: number;
  speaking: boolean;
}

function AvatarModel({ animation, audioLevel, speaking }: AvatarProps) {
  const vrm = useVrmLoader('./assets/model.vrm');
  const { play, update: updateAnimation } = useVrmAnimation(vrm);
  const updateLipSync = useAmplitudeLipSync(vrm);
  const updateBlink = useBlink(vrm);

  useEffect(() => {
    void play(animation);
  }, [animation, play]);

  useFrame((_, delta) => {
    if (!vrm) return;
    updateAnimation(delta);
    updateBlink(delta);
    updateLipSync(delta, audioLevel, speaking);
    vrm.update(delta);
  });

  return vrm ? <primitive object={vrm.scene} /> : null;
}

export function Avatar(props: AvatarProps) {
  return (
    <Suspense fallback={null}>
      <AvatarModel {...props} />
    </Suspense>
  );
}
