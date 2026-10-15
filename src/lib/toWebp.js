/**
 * Turn any uploaded image into a real WebP file, or refuse it.
 *
 * WHY THIS IS STRICT
 *
 * The old compressImage() let three kinds of non-WebP through, and a full scan
 * of the uploads bucket (2026-10-04) found 1,190 of 2,058 files were not WebP:
 *
 *   - Small files were uploaded untouched ("under 400 KB, leave it"), so PNGs,
 *     JPEGs and AVIFs went straight to storage.
 *   - If WebP came out bigger than the original, the original was kept.
 *   - Safari cannot encode WebP from a canvas. Per the canvas spec, toBlob then
 *     silently returns a PNG — and the code named that PNG ".webp" anyway.
 *     364 such fake .webp files, from 24 different accounts.
 *
 * Now every image is re-encoded, the result is checked by its actual bytes
 * (RIFF....WEBP), and anything that is still not WebP is never uploaded.
 *
 * FALLBACKS, both loaded only when needed so ordinary pages stay light:
 *
 *   - heic-to decodes iPhone HEIC photos in browsers that cannot (all but
 *     Safari).
 *   - @jsquash/webp encodes WebP in WebAssembly when the browser's canvas will
 *     not (Safari).
 */

const MAX_EDGE = 2000; // px on the long side
const QUALITY = 0.82;

const IMAGE_EXT = /\.(png|jpe?g|jfif|webp|gif|bmp|avif|heic|heif|tiff?)$/i;

/** True for anything that should leave this browser as WebP. */
export function isImageFile(file) {
  return Boolean(file) && (file.type?.startsWith("image/") || IMAGE_EXT.test(file.name || ""));
}

/** WebP files start "RIFF", four size bytes, then "WEBP". */
export function isWebpBytes(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50   // WEBP
  );
}

async function headBytes(blob, n = 16) {
  return new Uint8Array(await blob.slice(0, n).arrayBuffer());
}

/** "Some photo.HEIC" -> "Some photo.webp" */
export function webpName(name) {
  const base = (name || "image").replace(/\.[^./\\]+$/, "");
  return `${base || "image"}.webp`;
}

/* ---------------------------------------------------------------- decode */

function decodeViaImgElement(blob) {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve({ source: el, width: el.naturalWidth, height: el.naturalHeight, cleanup: () => URL.revokeObjectURL(url) });
    el.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not decode image")); };
    el.src = url;
  });
}

async function decodeNative(blob) {
  try {
    const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
    return { source: bmp, width: bmp.width, height: bmp.height, cleanup: () => bmp.close?.() };
  } catch {
    // Safari can show HEIC through <img> although createImageBitmap refuses it.
    return decodeViaImgElement(blob);
  }
}

async function decode(file) {
  try {
    return await decodeNative(file);
  } catch (nativeErr) {
    // Chrome, Edge and Firefox cannot read HEIC at all; decode it in WASM.
    const { isHeic, heicTo } = await import("heic-to");
    if (!(await isHeic(file).catch(() => false))) throw nativeErr;
    const png = await heicTo({ blob: file, type: "image/png" });
    return decodeNative(png);
  }
}

/* ---------------------------------------------------------------- encode */

async function encodeWebp(canvas, ctx) {
  const viaCanvas = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", QUALITY));
  if (viaCanvas && isWebpBytes(await headBytes(viaCanvas))) return viaCanvas;

  // The browser handed back something else (Safari gives PNG). Encode in WASM.
  const { encode } = await import("@jsquash/webp");
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const buf = await encode(pixels, { quality: Math.round(QUALITY * 100) });
  return new Blob([buf], { type: "image/webp" });
}

/* ------------------------------------------------------------------ main */

/**
 * Resolve to a File that is verifiably WebP, at most MAX_EDGE on its long
 * side. Throws, with a message fit to show the member, if that is impossible.
 */
export async function toWebp(file) {
  let decoded;
  try {
    decoded = await decode(file);
  } catch {
    throw new Error(
      `"${file.name || "This file"}" could not be read as an image. ` +
      "Please save it as a JPEG or PNG and try again."
    );
  }

  try {
    const { source, width, height } = decoded;
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));

    // Already genuine WebP and small enough: re-encoding would only lose quality.
    if (scale === 1 && isWebpBytes(await headBytes(file))) {
      return new File([file], webpName(file.name), { type: "image/webp" });
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    const blob = await encodeWebp(canvas, ctx);
    if (!isWebpBytes(await headBytes(blob))) {
      throw new Error("WebP encoding produced a non-WebP file");
    }
    return new File([blob], webpName(file.name), { type: "image/webp" });
  } catch (err) {
    console.error("WebP conversion failed:", err);
    throw new Error(
      `"${file.name || "This image"}" could not be converted for upload. ` +
      "Please try a different image, or save it as a JPEG and try again."
    );
  } finally {
    decoded.cleanup?.();
  }
}
