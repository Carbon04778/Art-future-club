import { useEffect, useState } from "react";

/**
 * A preview URL for a chosen file.
 *
 * WHY THIS EXISTS
 *
 * URL.createObjectURL was being called during render — inside useMemo, or
 * straight in the JSX. Two consequences:
 *
 *   1. If the browser refuses the value, it throws WHILE REACT IS RENDERING.
 *      React unmounts the tree and the page goes blank with no error shown.
 *      That is exactly what happened when choosing an exhibition image.
 *
 *   2. The URL was never revoked, so every file chosen leaked memory for as
 *      long as the tab stayed open.
 *
 * Creating it in an effect fixes both: a throw here cannot blank the page, and
 * the URL is released when the file changes or the component unmounts.
 */
export function useFilePreview(file) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    let created = "";
    try {
      created = URL.createObjectURL(file);
      setUrl(created);
    } catch {
      // A preview is a convenience. Losing it must not stop the upload.
      setUrl("");
    }
    return () => {
      if (created) URL.revokeObjectURL(created);
    };
  }, [file]);

  return url;
}

/**
 * For lists, where a hook cannot be called per item.
 *
 * Returns "" rather than throwing, so a bad entry renders no thumbnail instead
 * of taking the page down with it.
 *
 * ⚠️ These are not revoked — only use it for short-lived previews in a form
 * the user is about to submit.
 */
export function safeObjectURL(file) {
  if (!file) return "";
  try {
    return URL.createObjectURL(file);
  } catch {
    return "";
  }
}