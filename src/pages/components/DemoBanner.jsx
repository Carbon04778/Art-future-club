import React, { useState } from "react";
import { X } from "lucide-react";
import { BACKEND } from "@/api/base44Client";

/**
 * Preview-build notice.
 *
 * Only renders while the app is running on the demo data provider. Once
 * src/api/base44Client.js points at the Supabase provider, BACKEND stops
 * being "mock" and this disappears on its own — no code to remove.
 */
export default function DemoBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (BACKEND !== "mock" || dismissed) return null;

  return (
    <div className="relative z-[60] border-b border-primary/30 bg-primary/10 px-6 py-2 md:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="font-mono-caps text-[10px] leading-relaxed text-primary">
          Preview build — sample content, not live data. Sign in with any email
          and any 6-character password.
        </p>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss preview notice"
          className="shrink-0 text-primary/70 transition-colors hover:text-primary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
