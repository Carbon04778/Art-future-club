import React, { useEffect, useState } from 'react';

/**
 * The "L-Frame" Cursor — a framing tool that highlights art on hover.
 * Renders two L-shaped brackets that snap toward hovered media.
 *
 * Mounted ONCE in App.jsx, above <Routes>, so every page has a cursor.
 * `body { cursor: none }` in index.css hides the system cursor, so if this
 * component is absent or stops tracking, the user is left with no cursor at
 * all — which is what "the cursor keeps disappearing" meant.
 */
export default function LFrameCursor() {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  const [active, setActive] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const move = (e) => {
      setPos({ x: e.clientX, y: e.clientY });
      // e.target is not always an Element — over an SVG, a text node, or the
      // document itself it can lack .closest, which threw and killed the
      // listener, freezing the cursor until a page reload.
      const el =
        e.target instanceof Element
          ? e.target.closest('[data-artwork], a, button, [role="button"], input, textarea, select, label')
          : null;
      setActive(!!el);
      setVisible(true);
    };

    // Leaving the window (into devtools, another tab, or an iframe such as a
    // map tile layer) left the cursor stranded at its last position.
    const leave = () => setVisible(false);
    const enter = () => setVisible(true);

    window.addEventListener('mousemove', move, { passive: true });
    document.addEventListener('mouseleave', leave);
    document.addEventListener('mouseenter', enter);
    window.addEventListener('blur', leave);
    window.addEventListener('focus', enter);

    return () => {
      window.removeEventListener('mousemove', move);
      document.removeEventListener('mouseleave', leave);
      document.removeEventListener('mouseenter', enter);
      window.removeEventListener('blur', leave);
      window.removeEventListener('focus', enter);
    };
  }, []);

  const size = active ? 96 : 52;

  return (
    <div
      className="l-frame-cursor pointer-events-none fixed z-[9999] transition-[width,height] duration-200 ease-out"
      style={{
        left: pos.x - size / 2,
        top: pos.y - size / 2,
        width: size,
        height: size,
        opacity: visible ? 1 : 0,
      }}
      aria-hidden="true"
    >
      {/* four corner L-brackets */}
      <span className="absolute top-0 left-0 h-3 w-3 border-t-2 border-l-2 border-foreground" />
      <span className="absolute top-0 right-0 h-3 w-3 border-t-2 border-r-2 border-foreground" />
      <span className="absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-foreground" />
      <span className="absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-foreground" />
      {active && (
        <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
      )}
    </div>
  );
}
