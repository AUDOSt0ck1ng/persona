import { describe, expect, it } from 'vitest';
import {
  PORTRAIT_ZOOM_SIZE,
  portraitZoomPlacement,
} from './vroid-portrait-zoom';

const viewport = { height: 800, width: 1000 };

function thumbnail(left: number, top: number) {
  return { bottom: top + 34, left, right: left + 34, top };
}

describe('portraitZoomPlacement', () => {
  it('sits to the thumbnail’s right, centred on it', () => {
    expect(portraitZoomPlacement(thumbnail(100, 400), viewport)).toEqual({
      left: 144,
      top: 417 - PORTRAIT_ZOOM_SIZE / 2,
    });
  });

  it('flips to the thumbnail’s left when the right edge is too close', () => {
    const placement = portraitZoomPlacement(thumbnail(740, 400), viewport);

    expect(placement.left).toBe(740 - 10 - PORTRAIT_ZOOM_SIZE);
    expect(placement.left + PORTRAIT_ZOOM_SIZE).toBeLessThan(740);
  });

  it('keeps the whole zoom on screen for a card at any edge', () => {
    for (const anchor of [
      thumbnail(0, 0),
      thumbnail(0, viewport.height - 34),
      thumbnail(viewport.width - 34, 0),
      thumbnail(viewport.width - 34, viewport.height - 34),
    ]) {
      const { left, top } = portraitZoomPlacement(anchor, viewport);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(left + PORTRAIT_ZOOM_SIZE).toBeLessThanOrEqual(viewport.width);
      expect(top + PORTRAIT_ZOOM_SIZE).toBeLessThanOrEqual(viewport.height);
    }
  });

  it('keeps the top-left corner visible in a window too small to hold it', () => {
    expect(portraitZoomPlacement(thumbnail(10, 10), { height: 120, width: 120 }))
      .toEqual({ left: 8, top: 8 });
  });
});
