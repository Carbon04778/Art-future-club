import React from 'react';

/**
 * Vertical Metadata Ribbons — fixed to the screen edges, acting as a navigational anchor.
 */
export default function VerticalMetadata({ leftText, rightText }) {
  return (
    <>
      <div className="pointer-events-none fixed left-3 top-1/2 z-40 hidden -translate-y-1/2 md:block">
        <span className="vertical-rl font-mono-caps text-[11px] text-muted-foreground">
          {leftText}
        </span>
      </div>
      <div className="pointer-events-none fixed right-3 top-1/2 z-40 hidden -translate-y-1/2 md:block">
        <span className="vertical-rl font-mono-caps text-[11px] text-muted-foreground">
          {rightText}
        </span>
      </div>
    </>
  );
}