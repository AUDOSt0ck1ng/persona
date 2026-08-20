export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DrawingBufferSize {
  width: number;
  height: number;
}

export interface DrawingBufferPixel {
  x: number;
  y: number;
}

// Sampled alpha, so anything faint enough to read as background — an
// antialiased edge, the softest end of a hair texture — passes the click
// through rather than catching it on a barely visible pixel.
export const SILHOUETTE_ALPHA_THRESHOLD = 64;

/**
 * Cursor position as a pixel in the drawing buffer, or `null` when it falls
 * outside the canvas. The drawing buffer is scaled by device pixel ratio and
 * read from its bottom-left corner, so this rescales and flips Y.
 */
export function drawingBufferPixel(
  rect: CanvasRect,
  buffer: DrawingBufferSize,
  clientX: number,
  clientY: number,
): DrawingBufferPixel | null {
  if (rect.width === 0 || rect.height === 0) return null;
  const x = Math.floor(((clientX - rect.left) / rect.width) * buffer.width);
  const y = Math.floor(((clientY - rect.top) / rect.height) * buffer.height);
  if (x < 0 || y < 0 || x >= buffer.width || y >= buffer.height) return null;
  return { x, y: buffer.height - 1 - y };
}

/**
 * Whether the avatar window should ignore the mouse at a sampled pixel:
 * anything the character actually drew takes input, the transparent area around
 * it passes through, and a gesture already under way never flips mid-orbit or
 * mid-drag.
 *
 * `gestureActive` means a press this window received, not merely a held button.
 * A gesture that began on the desktop still forwards its moves here while the
 * window is ignoring them, and must not pull input away from what it started
 * on.
 */
export function passthroughForAlpha({
  alpha,
  gestureActive,
}: {
  alpha: number;
  gestureActive: boolean;
}): boolean {
  if (gestureActive) return false;
  return alpha < SILHOUETTE_ALPHA_THRESHOLD;
}
