import React from "react";
import { Instagram, Facebook, Youtube, Linkedin } from "lucide-react";
import { SOCIAL_LINKS } from "@/lib/socialLinks";

/**
 * The club's social accounts, as icons or as a text list.
 *
 * lucide-react has no Threads glyph, so that one is inline — the same approach
 * the codebase already takes for TikTok and X.
 */
const ThreadsIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M12.19 22h-.01c-3.16-.02-5.59-1.06-7.22-3.09C3.52 17.13 2.77 14.6 2.75 12v-.02c.02-2.6.77-5.13 2.21-6.93C6.59 3.06 9.02 2.02 12.18 2h.02c2.43.02 4.46.65 6.04 1.88 1.48 1.15 2.52 2.79 3.1 4.87l-1.95.55c-.98-3.5-3.45-5.29-7.2-5.32-2.55.02-4.47.82-5.72 2.37C5.29 7.85 4.7 9.9 4.69 12c.01 2.1.6 4.15 1.78 5.65 1.25 1.55 3.17 2.35 5.72 2.37 2.29-.02 3.81-.56 5.07-1.81 1.44-1.43 1.41-3.18 .95-4.25-.27-.62-.76-1.14-1.42-1.53-.17 1.17-.54 2.12-1.12 2.83-.77.95-1.87 1.47-3.26 1.54-1.05.06-2.07-.19-2.85-.7-.93-.6-1.47-1.53-1.53-2.6-.06-1.05.36-2.01 1.18-2.71.78-.67 1.89-1.06 3.2-1.13.97-.05 1.87.01 2.7.17-.11-.66-.33-1.18-.66-1.55-.45-.51-1.15-.77-2.08-.78h-.03c-.75 0-1.76.21-2.41 1.17l-1.61-1.1c.87-1.28 2.28-1.99 4.02-1.99h.04c2.91.02 4.64 1.8 4.81 4.9.1.04.2.09.29.13 1.36.64 2.36 1.61 2.88 2.81.73 1.67.8 4.39-1.42 6.59-1.69 1.68-3.75 2.44-6.66 2.46zM12.9 12.6c-.22 0-.44 0-.67.02-1.64.09-2.66.84-2.6 1.91.06 1.12 1.3 1.64 2.49 1.58.68-.04 2.03-.31 2.33-3-.48-.11-1-.16-1.55-.16z" />
  </svg>
);

const ICONS = {
  Instagram,
  Facebook,
  YouTube: Youtube,
  LinkedIn: Linkedin,
  Threads: ThreadsIcon,
};

/**
 * @param compact   icons only, no names — for a tight footer row
 * @param className extra classes on the wrapper
 * @param linkClass extra classes on each link, so each footer keeps its own
 *                  colour scheme (the manifesto footer sits on an inverted
 *                  panel and needs different contrast)
 */
export default function SocialLinks({ compact = false, className = "", linkClass = "" }) {
  return (
    <ul className={`flex flex-wrap items-center ${compact ? "gap-4" : "gap-x-5 gap-y-2"} ${className}`}>
      {SOCIAL_LINKS.map(({ name, url }) => {
        const Icon = ICONS[name];
        return (
          <li key={name}>
            <a
              href={url}
              target="_blank"
              // noreferrer implies noopener, but both are stated because this
              // opens an external tab from a page the member may be signed in to.
              rel="noreferrer noopener"
              aria-label={`Art Future Club on ${name}`}
              title={name}
              className={`inline-flex items-center gap-2 transition-colors ${linkClass}`}
            >
              {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
              {!compact && <span className="text-sm">{name}</span>}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
