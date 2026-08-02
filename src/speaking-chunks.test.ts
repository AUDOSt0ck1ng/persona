import { describe, expect, it } from 'vitest';
import {
  holdSpeakingChunkAfterResume,
  nextSpeakingChunkUrl,
  speakingChunkDwellSeconds,
  speakingChunkBlendWeights,
  speakingChunkSequenceUrls,
  speakingChunkTransitionDurations,
  shouldAdvanceSpeakingSequence,
} from './speaking-chunks';

describe('speaking motion chunks', () => {
  it('sequences only multi-clip voice-driven speaking motion', () => {
    expect(
      speakingChunkSequenceUrls('TALK', 'loop', [
        'chunk1.vrma',
        'chunk2.vrma',
        'chunk1.vrma',
      ]),
    ).toEqual(['chunk1.vrma', 'chunk2.vrma']);
    expect(speakingChunkSequenceUrls('TALK', 'loop', ['chunk1.vrma'])).toBeNull();
    expect(
      speakingChunkSequenceUrls('TALK', 'once', [
        'chunk1.vrma',
        'chunk2.vrma',
      ]),
    ).toBeNull();
    expect(
      speakingChunkSequenceUrls('IDLE', 'loop', [
        'chunk1.vrma',
        'chunk2.vrma',
      ]),
    ).toBeNull();
  });

  it('avoids immediate repeats and clips that failed to load', () => {
    expect(
      nextSpeakingChunkUrl(
        ['chunk1.vrma', 'chunk2.vrma', 'chunk3.vrma'],
        'chunk1.vrma',
        new Set(['chunk2.vrma']),
        () => 0,
      ),
    ).toBe('chunk3.vrma');
    expect(
      nextSpeakingChunkUrl(
        ['chunk1.vrma', 'chunk2.vrma'],
        'chunk1.vrma',
        new Set(['chunk2.vrma']),
        () => 0,
      ),
    ).toBe('chunk1.vrma');
  });

  it('slows entry without exposing the model rest pose', () => {
    expect(speakingChunkBlendWeights(0, 1.8, 0.45)).toEqual({
      incoming: 0,
      outgoing: 1,
    });
    const entryMidpoint = speakingChunkBlendWeights(0.9, 1.8, 0.45);
    expect(entryMidpoint.incoming).toBeCloseTo(0.25, 5);
    expect(entryMidpoint.outgoing).toBeCloseTo(0.75, 5);
    expect(entryMidpoint.incoming + entryMidpoint.outgoing).toBeCloseTo(1, 8);
    expect(speakingChunkBlendWeights(2.25, 1.8, 0.45)).toEqual({
      incoming: 1,
      outgoing: 0,
    });
  });

  it('turns factors into independently scaled transition durations', () => {
    const fast = speakingChunkTransitionDurations({
      entry_factor: [0.1, 0.1],
      exit_factor: [0.1, 0.1],
    });
    const slow = speakingChunkTransitionDurations({
      entry_factor: [8, 8],
      exit_factor: [8, 8],
    });

    expect(fast.entry).toBeCloseTo(0.045, 8);
    expect(fast.exit).toBeCloseTo(0.045, 8);
    expect(fast.total).toBeCloseTo(0.09, 8);
    expect(slow).toEqual({ entry: 3.6, exit: 3.6, total: 7.2 });
    expect(speakingChunkBlendWeights(fast.total, fast.entry, fast.exit)).toEqual(
      { incoming: 1, outgoing: 0 },
    );
    expect(speakingChunkBlendWeights(0.09, slow.entry, slow.exit).incoming)
      .toBeLessThan(0.02);
  });

  it('samples entry and exit independently for every transition', () => {
    const samples = [0, 1];
    const durations = speakingChunkTransitionDurations(
      {
        entry_factor: [1.5, 1.8],
        exit_factor: [1.5, 1.8],
      },
      () => samples.shift() ?? 0,
    );

    expect(durations.entry).toBeCloseTo(0.675, 8);
    expect(durations.exit).toBeCloseTo(0.81, 8);
    expect(durations.total).toBeCloseTo(1.485, 8);
  });

  it('holds the selected speaking chunk while live audio is paused', () => {
    const readyToAdvance = {
      mixerTime: 10,
      nextTransitionAt: 9,
    };

    expect(
      shouldAdvanceSpeakingSequence({
        ...readyToAdvance,
        speakingActive: false,
      }),
    ).toBe(false);
    expect(
      shouldAdvanceSpeakingSequence({
        ...readyToAdvance,
        speakingActive: true,
      }),
    ).toBe(true);
  });

  it('keeps the current chunk after speech resumes instead of switching immediately', () => {
    expect(holdSpeakingChunkAfterResume(9, 10)).toBeCloseTo(10.7, 8);
    expect(holdSpeakingChunkAfterResume(12, 10)).toBe(12);
  });

  it('gives a chunk enough dwell time to play and complete its blend', () => {
    expect(speakingChunkDwellSeconds(2.4, 1.2)).toBe(2.4);
    expect(speakingChunkDwellSeconds(1, 1.5)).toBe(2);
  });
});
