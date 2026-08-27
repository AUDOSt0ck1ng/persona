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
 * Whether the character is drawn solidly enough at a sampled pixel to count as
 * being there. Both the click routing and the cursor shape ask this, so the
 * threshold has one owner and the two can never disagree about where the
 * character ends.
 */
export function characterCoversAlpha(alpha: number): boolean {
  return alpha >= SILHOUETTE_ALPHA_THRESHOLD;
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
  return !characterCoversAlpha(alpha);
}

export interface ClickThroughCopy {
  description: string;
  note: string;
}

const TRAY_RECOVERY =
  'The tray menu toggles this too, and is the way back to a fully interactive window.';

/**
 * What the Settings control says about the mode this platform got. The modes
 * differ in what stays clickable, so one description cannot cover both, and
 * only the mode without mouse-move forwarding carries the Linux caveat.
 */
export function clickThroughCopy(mode: ClickThroughMode): ClickThroughCopy {
  if (mode === 'silhouette') {
    return {
      description:
        'Clicks land on whatever sits behind the transparent area around the character. The character itself still takes orbit, zoom, and Alt+drag.',
      note: TRAY_RECOVERY,
    };
  }
  return {
    description:
      'Clicks pass through the entire avatar window, including the character. This platform cannot forward mouse moves to a window that ignores clicks, which is what handing input back over the character would need.',
    note:
      'Experimental on Linux: it relies on the X11 input shape, and no Wayland compositor has been verified. ' +
      TRAY_RECOVERY,
  };
}
