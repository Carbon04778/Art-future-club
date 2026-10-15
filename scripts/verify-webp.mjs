/**
 * Verifies the strict WebP upload rule (src/lib/toWebp.js).
 *
 * The canvas encoding itself needs a real browser; this covers the parts that
 * decide what is let through, plus a guard that the upload path cannot bypass
 * the conversion again.
 *
 * Run: npm run verify:webp
 */

import { readFileSync } from "node:fs";
import { isImageFile, isWebpBytes, webpName } from "../src/lib/toWebp.js";

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") =>
  cond ? pass++ : failures.push(`${name}${detail ? ` — ${detail}` : ""}`);

const bytes = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));

// --- real format is judged by bytes, never by name -------------------------
check("RIFF....WEBP is WebP", isWebpBytes(bytes("RIFF\x10\x00\x00\x00WEBPVP8 ")));
check("PNG bytes are not WebP", !isWebpBytes(bytes("\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR")));
check("JPEG bytes are not WebP", !isWebpBytes(bytes("\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01")));
check("AVIF bytes are not WebP", !isWebpBytes(bytes("\x00\x00\x00\x1cftypavif\x00\x00")));
check("RIFF without WEBP (a WAV) is not WebP", !isWebpBytes(bytes("RIFF\x10\x00\x00\x00WAVEfmt ")));
check("too short is not WebP", !isWebpBytes(bytes("RIFF")));

// --- which files must be converted ------------------------------------------
check("PNG is an image", isImageFile({ name: "a.png", type: "image/png" }));
check("HEIC with no MIME type is an image", isImageFile({ name: "IMG_0001.HEIC", type: "" }));
check("AVIF is an image", isImageFile({ name: "x.avif", type: "image/avif" }));
check("the cropper's output is an image", isImageFile({ name: "cropped.png", type: "image/png" }));
check("PDF is not an image", !isImageFile({ name: "cv.pdf", type: "application/pdf" }));
check("no file is not an image", !isImageFile(null));

// --- output names ------------------------------------------------------------
check("extension becomes .webp", webpName("photo.HEIC") === "photo.webp", webpName("photo.HEIC"));
check("dots in the name survive", webpName("a.b.c.png") === "a.b.c.webp", webpName("a.b.c.png"));
check("a fake .webp stays .webp", webpName("x.webp") === "x.webp");
check("no extension gains .webp", webpName("scan") === "scan.webp");
check("empty name is named", webpName("") === "image.webp");

// --- the upload path cannot skip the conversion ----------------------------
const provider = readFileSync(new URL("../src/api/providers/supabase.js", import.meta.url), "utf8");
check("UploadFile converts through prepareUpload", /await prepareUpload\(file\)/.test(provider));
check("old size-based skip is gone", !/compressImage|file\.size < 400_000/.test(provider));
check("upload re-checks the bytes before sending", /isWebpBytes\(/.test(provider));

const upload = provider.slice(provider.indexOf("async function UploadFile"));
check("only the prepared file is uploaded",
  /\.upload\(path, optimised/.test(upload) && !/\.upload\(path, file\b/.test(upload));

console.log(`\nverify-webp: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((f) => console.log("  FAIL", f));
  process.exit(1);
}
