/**
 * The club's social accounts — one list, used by every footer.
 *
 * WHY THIS IS A MODULE AND NOT MARKUP
 *
 * ManifestoFooter carried its own hardcoded list of nine names, every one of
 * them linking to "#manifesto" — an anchor on the page itself. They looked
 * like social links and went nowhere. SlimFooter, which appears on the other
 * twenty-six pages, had none at all.
 *
 * Keeping them here means adding an account updates every footer at once,
 * which is the failure this codebase keeps repeating with duplicated lists.
 *
 * Four names were listed before with no account behind them — Are.na,
 * Xiaohongshu, Substack and Newsletter. They are omitted rather than left
 * pointing nowhere; add them here when the accounts exist.
 */

export const SOCIAL_LINKS = [
  { name: "Instagram", url: "https://www.instagram.com/artfutureclub/" },
  { name: "Facebook", url: "https://www.facebook.com/artfutureclub" },
  { name: "YouTube", url: "https://www.youtube.com/@ArtFutureClub" },
  { name: "Threads", url: "https://www.threads.com/@artfutureclub" },
  /*
   * The supplied URL ended "?viewAsMember=true". That parameter is what
   * LinkedIn adds when an admin previews their own page as a visitor would see
   * it; it is not part of the public address. Dropped so the link is the clean
   * company URL.
   */
  { name: "LinkedIn", url: "https://www.linkedin.com/company/art-future-club/" },
];
