/**
 * Runs the site's two crawler functions — api/prerender.js and api/og-image.js —
 * on this computer, the way Vercel routes them, so share previews can be
 * audited BEFORE a deploy:
 *
 *   node scripts/serve-api-local.mjs [port]        (default 5300)
 *   node scripts/audit-share-previews.mjs http://localhost:5300
 *
 * Reads records from the database in .env (VITE_SUPABASE_URL, anon key — the
 * same read-only access the live function has). Writes nothing. The page
 * shell (index.html) is taken from the live site, and /images/ is served from
 * public/images, so the pictures are the ones a deploy would ship.
 */
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const PORT = Number(process.argv[2] || 5300);
process.env.VITE_SUPABASE_URL = E.VITE_SUPABASE_URL;
process.env.VITE_SUPABASE_ANON_KEY = E.VITE_SUPABASE_ANON_KEY;
process.env.VITE_SITE_URL = `http://localhost:${PORT}`;

// Imported after the environment is set: both read it when they load.
const prerender = (await import("../api/prerender.js")).default;
const ogImage = (await import("../api/og-image.js")).default;
const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
const crawlerRule = vercel.rewrites.find((r) => r.destination === "/api/prerender");
const sections = crawlerRule.source.match(/\(([^)]+)\)/)[1].split("|");
const crawlerUA = new RegExp(crawlerRule.has[0].value);
const TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml" };

/** The small part of Vercel's req/res that the two functions use. */
const shim = (res) => {
  res.status = (c) => { res.statusCode = c; return res; };
  res.send = (b) => res.end(b);
  return res;
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === "/api/og-image") {
      req.query = Object.fromEntries(url.searchParams);
      return await ogImage(req, shim(res));
    }
    if (url.pathname.startsWith("/images/")) {
      const f = join(ROOT, "public", decodeURIComponent(url.pathname));
      if (!f.startsWith(join(ROOT, "public")) || !existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": TYPES[extname(f).toLowerCase()] || "application/octet-stream" });
      return res.end(readFileSync(f));
    }
    const [, section, segment, extra] = url.pathname.split("/");
    if (sections.includes(section) && segment && !extra && crawlerUA.test(req.headers["user-agent"] || "")) {
      // The live shell carries the real bundle names.
      req.headers["x-forwarded-host"] = "www.artfutureclub.com";
      return await prerender(req, shim(res));
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("only crawler pages, /api/og-image and /images/ are served here");
  } catch (e) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(String(e?.stack || e));
  }
}).listen(PORT, () => console.log(`crawler functions on http://localhost:${PORT} (data: ${E.VITE_SUPABASE_URL})`));
