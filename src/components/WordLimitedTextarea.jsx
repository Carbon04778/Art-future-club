import React from "react";

/** Words, counting any run of non-space characters. */
export const countWords = (text) =>
  (String(text || "").trim().match(/\S+/g) || []).length;

/**
 * A textarea with a word limit and a live count.
 *
 * The limit is enforced on TYPING rather than on save: telling someone their
 * 400-word statement is too long only once they press Save wastes the writing
 * they have already done. Pasting more than the limit keeps the first N words
 * rather than rejecting the paste outright.
 */
export default function WordLimitedTextarea({
  value,
  onChange,
  limit = 300,
  rows = 5,
  className = "",
  placeholder = "",
  label,
}) {
  const used = countWords(value);
  const remaining = limit - used;

  const handle = (next) => {
    const words = String(next).trim().match(/\S+/g) || [];
    if (words.length <= limit) {
      onChange(next);
      return;
    }
    // Over the limit — keep the first `limit` words rather than dropping
    // everything that was pasted.
    onChange(words.slice(0, limit).join(" "));
  };

  return (
    <div>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => handle(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={`resize-none ${className}`}
      />
      <p
        className={`mt-1 text-right font-mono-caps text-[10px] ${
          remaining <= 0
            ? "text-destructive"
            : remaining <= limit * 0.1
            ? "text-yellow-600"
            : "text-muted-foreground"
        }`}
      >
        {used} / {limit} words
        {remaining <= 0 ? " — limit reached" : ""}
      </p>
    </div>
  );
}
