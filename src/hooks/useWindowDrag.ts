import { useEffect } from 'react';

export function useWindowDrag() {
  useEffect(() => {
    const bridge = window.personaBridge;
    if (!bridge) return;

    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const stopDragging = () => {
      dragging = false;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!event.altKey || event.button !== 0) return;
      dragging = true;
      lastX = event.screenX;
      lastY = event.screenY;
      // The window moves out from under a fast drag faster than pointermove
      // events arrive, so the OS cursor quickly ends up outside this
      // (small) window's client area. Pointer capture keeps events routed
      // here regardless of where the cursor actually is on screen.
      if (event.target instanceof Element) {
        event.target.setPointerCapture(event.pointerId);
      }
      event.stopPropagation();
      event.preventDefault();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      if (!(event.buttons & 1)) {
        // The primary button released while the cursor was outside our
        // bounds, so no pointerup ever reached us; treat this move as the
        // end of the drag instead of leaving `dragging` stuck true.
        stopDragging();
        return;
      }
      bridge.moveBy(event.screenX - lastX, event.screenY - lastY);
      lastX = event.screenX;
      lastY = event.screenY;
      event.stopPropagation();
      event.preventDefault();
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!dragging) return;
      stopDragging();
      event.stopPropagation();
    };
    const onLostPointerCapture = () => stopDragging();

    document.addEventListener('pointerdown', onPointerDown, { capture: true });
    document.addEventListener('pointermove', onPointerMove, { capture: true });
    document.addEventListener('pointerup', onPointerUp, { capture: true });
    document.addEventListener('lostpointercapture', onLostPointerCapture, {
      capture: true,
    });
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, { capture: true });
      document.removeEventListener('pointermove', onPointerMove, { capture: true });
      document.removeEventListener('pointerup', onPointerUp, { capture: true });
      document.removeEventListener(
        'lostpointercapture',
        onLostPointerCapture,
        { capture: true },
      );
    };
  }, []);
}
