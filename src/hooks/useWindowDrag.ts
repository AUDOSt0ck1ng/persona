import { useEffect } from 'react';

export function useWindowDrag() {
  useEffect(() => {
    const bridge = window.personaBridge;
    if (!bridge) return;

    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (event: PointerEvent) => {
      if (!event.altKey || event.button !== 0) return;
      dragging = true;
      lastX = event.screenX;
      lastY = event.screenY;
      event.stopPropagation();
      event.preventDefault();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      bridge.moveBy(event.screenX - lastX, event.screenY - lastY);
      lastX = event.screenX;
      lastY = event.screenY;
      event.stopPropagation();
      event.preventDefault();
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      event.stopPropagation();
    };

    document.addEventListener('pointerdown', onPointerDown, { capture: true });
    document.addEventListener('pointermove', onPointerMove, { capture: true });
    document.addEventListener('pointerup', onPointerUp, { capture: true });
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, { capture: true });
      document.removeEventListener('pointermove', onPointerMove, { capture: true });
      document.removeEventListener('pointerup', onPointerUp, { capture: true });
    };
  }, []);
}
