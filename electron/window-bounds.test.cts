import assert from 'node:assert/strict';
import test from 'node:test';
import { MIN_VISIBLE_EDGE, clampWindowPosition } from './window-bounds.cjs';

const primary = { x: 0, y: 0, width: 1920, height: 1040 };
const secondary = { x: 1920, y: 0, width: 1920, height: 1040 };
const avatar = { width: 360, height: 540 };

test("leaves a position that is well inside a work area alone", () => {
  assert.deepEqual(
    clampWindowPosition({ x: 800, y: 300, ...avatar }, [primary]),
    { x: 800, y: 300 },
  );
});

test("leaves a position that keeps exactly the margin on screen alone", () => {
  const x = primary.width - MIN_VISIBLE_EDGE;
  assert.deepEqual(
    clampWindowPosition({ x, y: 300, ...avatar }, [primary]),
    { x, y: 300 },
  );
});

test("pulls a window dragged off the right edge back to the margin", () => {
  assert.deepEqual(
    clampWindowPosition({ x: 4000, y: 300, ...avatar }, [primary]),
    { x: primary.width - MIN_VISIBLE_EDGE, y: 300 },
  );
});

test("pulls a window dragged off the top left back to the margin", () => {
  assert.deepEqual(
    clampWindowPosition({ x: -900, y: -900, ...avatar }, [primary]),
    {
      x: -(avatar.width - MIN_VISIBLE_EDGE),
      y: -(avatar.height - MIN_VISIBLE_EDGE),
    },
  );
});

test("clamps only the axis that left the work area", () => {
  assert.deepEqual(
    clampWindowPosition({ x: 4000, y: 300, ...avatar }, [primary]),
    { x: primary.width - MIN_VISIBLE_EDGE, y: 300 },
  );
  assert.deepEqual(
    clampWindowPosition({ x: 800, y: 4000, ...avatar }, [primary]),
    { x: 800, y: primary.height - MIN_VISIBLE_EDGE },
  );
});

test("judges a window on a second display against that display", () => {
  // Far off the primary, but sitting comfortably on the secondary, so nothing
  // should drag it back across the desktop.
  const bounds = { x: 2600, y: 300, ...avatar };
  assert.deepEqual(clampWindowPosition(bounds, [primary, secondary]), {
    x: 2600,
    y: 300,
  });
});

test("clamps to the nearest work area rather than the first", () => {
  assert.deepEqual(
    clampWindowPosition({ x: 5000, y: 300, ...avatar }, [primary, secondary]),
    { x: secondary.x + secondary.width - MIN_VISIBLE_EDGE, y: 300 },
  );
});

test("keeps a window in the gap between two displays reachable", () => {
  // Displays stacked with a horizontal offset leave desktop coordinates that
  // belong to no display at all; a drag through one must still land somewhere
  // grabbable.
  const stacked = { x: 400, y: 1040, width: 1280, height: 1000 };
  const result = clampWindowPosition({ x: -2000, y: 1200, ...avatar }, [
    primary,
    stacked,
  ]);
  assert.deepEqual(result, {
    x: stacked.x - (avatar.width - MIN_VISIBLE_EDGE),
    y: 1200,
  });
});

test("asks a window smaller than the margin only for as much as it has", () => {
  const tiny = { x: 4000, y: 300, width: 40, height: 30 };
  assert.deepEqual(clampWindowPosition(tiny, [primary]), {
    x: primary.width - 40,
    y: 300,
  });
});

test("returns the requested position when no display is known", () => {
  assert.deepEqual(clampWindowPosition({ x: 4000, y: 4000, ...avatar }, []), {
    x: 4000,
    y: 4000,
  });
});

test("rounds a fractional position", () => {
  assert.deepEqual(
    clampWindowPosition({ x: 800.6, y: 300.4, ...avatar }, [primary]),
    { x: 801, y: 300 },
  );
});
