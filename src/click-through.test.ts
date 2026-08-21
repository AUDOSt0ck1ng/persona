import { describe, expect, it } from 'vitest';
import {
  clickThroughCopy,
  drawingBufferPixel,
  passthroughForAlpha,
  SILHOUETTE_ALPHA_THRESHOLD,
} from './click-through';

const CANVAS = { left: 100, top: 50, width: 400, height: 200 };
// A device pixel ratio of 1.5, the renderer's cap, against that CSS size.
const BUFFER = { width: 600, height: 300 };

describe('drawing buffer sampling', () => {
  it('scales css coordinates by the drawing buffer size', () => {
    expect(drawingBufferPixel(CANVAS, BUFFER, 300, 150)).toEqual({
      x: 300,
      y: 149,
    });
  });

  it('flips Y because the buffer is read from its bottom left', () => {
    expect(drawingBufferPixel(CANVAS, BUFFER, 100, 50)).toEqual({
      x: 0,
      y: 299,
    });
    expect(drawingBufferPixel(CANVAS, BUFFER, 499, 249)).toEqual({
      x: 598,
      y: 1,
    });
  });

  it('reports no pixel outside the canvas or without layout', () => {
    expect(drawingBufferPixel(CANVAS, BUFFER, 99, 150)).toBeNull();
    expect(drawingBufferPixel(CANVAS, BUFFER, 300, 49)).toBeNull();
    expect(drawingBufferPixel(CANVAS, BUFFER, 500, 150)).toBeNull();
    expect(drawingBufferPixel(CANVAS, BUFFER, 300, 250)).toBeNull();
    expect(drawingBufferPixel({ ...CANVAS, width: 0 }, BUFFER, 300, 150))
      .toBeNull();
  });
});

describe('silhouette alpha test', () => {
  it('takes input on what the character drew and passes the rest through', () => {
    expect(passthroughForAlpha({ alpha: 255, gestureActive: false })).toBe(false);
    expect(passthroughForAlpha({ alpha: 0, gestureActive: false })).toBe(true);
  });

  it('treats a barely visible pixel as background', () => {
    expect(
      passthroughForAlpha({
        alpha: SILHOUETTE_ALPHA_THRESHOLD - 1,
        gestureActive: false,
      }),
    ).toBe(true);
    expect(
      passthroughForAlpha({
        alpha: SILHOUETTE_ALPHA_THRESHOLD,
        gestureActive: false,
      }),
    ).toBe(false);
  });

  it('never releases the mouse mid-gesture', () => {
    expect(passthroughForAlpha({ alpha: 0, gestureActive: true })).toBe(false);
    expect(passthroughForAlpha({ alpha: 255, gestureActive: true })).toBe(false);
  });
});

describe('settings copy', () => {
  it('describes what stays clickable in each mode', () => {
    expect(clickThroughCopy('silhouette').description).toContain(
      'around the character',
    );
    expect(clickThroughCopy('whole-window').description).toContain(
      'including the character',
    );
  });

  it('carries the Linux caveat only where forwarding is unavailable', () => {
    expect(clickThroughCopy('silhouette').note).not.toContain('Experimental');
    expect(clickThroughCopy('whole-window').note).toContain('Experimental');
  });

  it('points at the tray toggle from either mode', () => {
    expect(clickThroughCopy('silhouette').note).toContain('tray menu');
    expect(clickThroughCopy('whole-window').note).toContain('tray menu');
  });
});
