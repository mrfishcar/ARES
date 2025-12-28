import { useEffect } from 'react';

// Keep a CSS variable in sync with the visual viewport so chrome can sit above the iOS keyboard
// without resizing the editor surface. This intentionally avoids scroll/height manipulation.
export function useKeyboardViewportOffset() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    const vv = window.visualViewport;

    const update = () => {
      const keyboard = vv ? Math.max(0, window.innerHeight - (vv.height + vv.offsetTop)) : 0;
      root.style.setProperty('--keyboard-offset', `${keyboard}px`);
    };

    const resetAndUpdate = () => {
      root.style.setProperty('--keyboard-offset', '0px');
      requestAnimationFrame(update);
      window.setTimeout(update, 200);
    };

    update();

    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('pageshow', resetAndUpdate);

    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('pageshow', resetAndUpdate);
    };
  }, []);
}
