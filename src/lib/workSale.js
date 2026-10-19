/**
 * An artwork's sale state, decided in one place (B2 in docs/CLIENT-REQUESTS.md).
 *
 * Works live as a JSON list on the artist profile. A sold work used to have
 * nowhere to go: untick "Available for sale" and it looked never-for-sale, or
 * delete it and lose it from the portfolio. `sold: true` keeps it on the page,
 * labelled Sold, with no price and no Enquire button.
 *
 * Works saved before this existed have no `sold` field and read as unsold, so
 * every existing work looks exactly as it did.
 */

/** Marked sold. */
export const isSold = (work) => work?.sold === true;

/** Can be enquired about and bought: offered for sale, and not sold. */
export const isForSale = (work) => Boolean(work?.available_for_sale) && !isSold(work);

/** The price line to show, or "" — a sold work shows no price. */
export function priceLabel(work) {
  if (!isForSale(work) || !work.price) return "";
  return `${work.currency || "USD"} ${work.price}`;
}

export const SOLD_LABEL = "Sold";
