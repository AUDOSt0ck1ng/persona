/**
 * Placement for the enlarged portrait a character card shows on hover, kept a
 * pure function of the two boxes so the rules that hold the zoom on screen can
 * be checked without a DOM.
 */

// Kept in step with .vroid-portrait-zoom's box in styles.css.
export const PORTRAIT_ZOOM_SIZE = 224;
const GAP = 10;
const MARGIN = 8;

export interface PortraitZoomPlacement {
  left: number;
  top: number;
}

function clamp(value: number, min: number, max: number): number {
  // Order matters: a viewport too small for the zoom puts max below min, and
  // the top-left corner is the half worth keeping.
  return Math.max(Math.min(value, max), min);
}

export function portraitZoomPlacement(
  anchor: { bottom: number; left: number; right: number; top: number },
  viewport: { height: number; width: number },
): PortraitZoomPlacement {
  const toTheRight = anchor.right + GAP;
  const left =
    toTheRight + PORTRAIT_ZOOM_SIZE + MARGIN <= viewport.width
      ? toTheRight
      : anchor.left - GAP - PORTRAIT_ZOOM_SIZE;
  return {
    left: clamp(left, MARGIN, viewport.width - PORTRAIT_ZOOM_SIZE - MARGIN),
    top: clamp(
      (anchor.top + anchor.bottom) / 2 - PORTRAIT_ZOOM_SIZE / 2,
      MARGIN,
      viewport.height - PORTRAIT_ZOOM_SIZE - MARGIN,
    ),
  };
}
