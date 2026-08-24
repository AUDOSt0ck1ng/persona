/**
 * The window is frameless and Alt+drag over the character is the only way to
 * move it, so a drag that put it past every display would leave nothing on
 * screen to aim at. Clamping the destination keeps it visible.
 */

export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowPosition {
  x: number;
  y: number;
}

/**
 * How much of the window stays inside a work area. Not a guarantee it can be
 * dragged back: under silhouette click-through the surviving strip is
 * transparent and passes the press through, which is what the tray is for.
 */
export const MIN_VISIBLE_EDGE = 64;

function overlap(
  start: number,
  length: number,
  otherStart: number,
  otherLength: number,
): number {
  return (
    Math.min(start + length, otherStart + otherLength) -
    Math.max(start, otherStart)
  );
}

function centreDistance(bounds: ScreenRect, area: ScreenRect): number {
  const dx = bounds.x + bounds.width / 2 - (area.x + area.width / 2);
  const dy = bounds.y + bounds.height / 2 - (area.y + area.height / 2);
  return dx * dx + dy * dy;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * Every work area is weighed rather than only the primary, so a window living
 * on a second display is judged against the display it is on.
 */
export function clampWindowPosition(
  bounds: ScreenRect,
  workAreas: readonly ScreenRect[],
  keep: number = MIN_VISIBLE_EDGE,
): WindowPosition {
  const requested = { x: Math.round(bounds.x), y: Math.round(bounds.y) };
  if (workAreas.length === 0) return requested;

  // A window smaller than the margin cannot overlap by the whole margin.
  const keepX = Math.min(keep, bounds.width);
  const keepY = Math.min(keep, bounds.height);

  const reachable = workAreas.some(
    (area) =>
      overlap(bounds.x, bounds.width, area.x, area.width) >= keepX &&
      overlap(bounds.y, bounds.height, area.y, area.height) >= keepY,
  );
  if (reachable) return requested;

  const area = workAreas.reduce((nearest, candidate) =>
    centreDistance(bounds, candidate) < centreDistance(bounds, nearest)
      ? candidate
      : nearest,
  );
  return {
    x: Math.round(
      clamp(
        bounds.x,
        area.x - (bounds.width - keepX),
        area.x + area.width - keepX,
      ),
    ),
    y: Math.round(
      clamp(
        bounds.y,
        area.y - (bounds.height - keepY),
        area.y + area.height - keepY,
      ),
    ),
  };
}
