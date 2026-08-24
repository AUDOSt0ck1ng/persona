/**
 * Keeps a dragged avatar window reachable.
 *
 * The window is frameless, so no window manager offers a titlebar to drag it
 * back with, and Alt+drag over the character is the only way to move it. Put
 * the whole window past the edge of every display and that gesture has nothing
 * left to land on, and nothing is drawn on screen to aim a correction at
 * either. Clamping the destination keeps the window where it can still be seen.
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
 * How much of the window has to stay inside a work area.
 *
 * Wide enough to aim at rather than a sliver that is only technically on
 * screen. It does not by itself guarantee the window can be dragged back:
 * Alt+drag lands on the character, and under silhouette click-through a strip
 * of transparent background passes the press to whatever is behind it. What
 * this buys is that the window stays visible and stays partly addressable, so
 * recovery is a drag whenever the character reaches the strip and the tray's
 * recentre otherwise.
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
 * The position `bounds` should actually be moved to.
 *
 * Every work area is considered rather than only the primary one, so a window
 * living on a second display is judged against the display it is on instead of
 * being dragged back across the desktop for being far from the first.
 */
export function clampWindowPosition(
  bounds: ScreenRect,
  workAreas: readonly ScreenRect[],
  keep: number = MIN_VISIBLE_EDGE,
): WindowPosition {
  const requested = { x: Math.round(bounds.x), y: Math.round(bounds.y) };
  if (workAreas.length === 0) return requested;

  // A window shorter or narrower than the margin can never overlap by the whole
  // margin, so ask it for as much of itself as there is.
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
