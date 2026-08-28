/**
 * Converting between stored timestamps and <input type="datetime-local">.
 *
 * THE BUG THIS EXISTS TO PREVENT
 *
 * Timestamps are stored in UTC. A datetime-local input shows and returns LOCAL
 * time. Slicing the first 16 characters off an ISO string looks like it works
 * — the shape is right — but it hands the input a UTC time and labels it local.
 *
 * Someone in Hong Kong entering 6pm saw 10am when they reopened the form, and
 * saving again shifted it a further eight hours. Every edit moved the event.
 *
 * These two functions convert properly, and are the only way a datetime should
 * reach or leave a form.
 */

const pad = (n) => String(n).padStart(2, "0");

/**
 * A stored timestamp, formatted for a datetime-local input in the viewer's
 * own timezone.
 */
export const toLocalInput = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d)) return "";
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
};

/**
 * What a datetime-local input returned, converted back to an ISO timestamp.
 *
 * Returns null rather than undefined for an empty value: undefined is dropped
 * when a payload is serialised to JSON, so clearing a date could never be
 * saved.
 */
export const fromLocalInput = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d) ? null : d.toISOString();
};
