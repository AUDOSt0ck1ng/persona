import { useEffect, useRef, useState } from 'react';
import { Scene } from './components/Scene';
import type { AnimationType } from './animation-catalog';

const INITIAL_STATE: VoiceState = {
  activity: 'idle',
  microphoneMuted: false,
  outputMuted: false,
  phase: 'inactive',
};

const BODY_IDLE_DELAY_MS = 650;

export function App() {
  const [voice, setVoice] = useState<VoiceState>(INITIAL_STATE);
  const [audioLevel, setAudioLevel] = useState(0);
  const [animation, setAnimation] = useState<AnimationType>('IDLE');
  const previousPhase = useRef<VoicePhase>('inactive');

  useEffect(() => {
    const bridge = window.personaBridge;
    if (!bridge) return;
    void bridge.getSnapshot().then((event) => {
      if (event?.type === 'state') setVoice(event.state);
    });
    return bridge.subscribe((event) => {
      if (event.type === 'state') {
        setVoice(event.state);
      } else if (event.type === 'audio-level') {
        setAudioLevel(event.level);
      } else if (event.type === 'animation') {
        setAnimation(event.animation);
      }
    });
  }, []);

  useEffect(() => {
    if (voice.phase === 'active' && previousPhase.current !== 'active') {
      setAnimation('GREETING');
      const timer = window.setTimeout(
        () => setAnimation(voice.activity === 'speaking' ? 'TALK' : 'IDLE'),
        2600,
      );
      previousPhase.current = voice.phase;
      return () => window.clearTimeout(timer);
    }
    previousPhase.current = voice.phase;

    if (voice.phase !== 'active' || voice.outputMuted) {
      setAnimation('IDLE');
      setAudioLevel(0);
      return;
    }

    if (voice.activity === 'speaking' && !voice.outputMuted) {
      setAnimation('TALK');
      return;
    }

    const timer = window.setTimeout(() => setAnimation('IDLE'), BODY_IDLE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [voice.activity, voice.outputMuted, voice.phase]);

  const speaking = voice.phase === 'active' && voice.activity === 'speaking' && !voice.outputMuted;

  return (
    <main className="app">
      <Scene
        animation={animation}
        audioLevel={audioLevel}
        speaking={speaking}
      />
    </main>
  );
}
