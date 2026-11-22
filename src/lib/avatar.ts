/** Profile pictures: where they live and how they are prepared in the browser before upload. */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** A stored picture path: {user_id}/{random}.{ext}. Mirrors the database check. */
export const AVATAR_PATH = new RegExp(`^(${UUID})/${UUID}\\.(webp|png|jpg)$`);
/** Pictures are cropped to a square of this many pixels: sharp on high-density screens, a few KB on disk. */
export const AVATAR_SIZE = 256;
export const AVATAR_MAX_INPUT_BYTES = 15 * 1024 * 1024;

/** Public URL of a stored picture, or null when the path isn't one of ours. */
export function avatarUrl(path: string | null | undefined, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""): string | null {
  if (!path || !AVATAR_PATH.test(path) || !supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/avatars/${path}`;
}

export const initialsOf = (name: string | null | undefined, email: string) =>
  (name || email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");

export type AvatarImage = { blob: Blob; ext: "webp" | "png" | "jpg"; contentType: string };

/**
 * Prepares a picture for the round avatar at AVATAR_SIZE. Photos are cropped to a centred square; logos (images
 * with a transparent background) are fitted whole inside the circle instead, so a wide logo keeps its edges.
 * Re-encoding also strips any metadata in the original, such as the GPS location in a phone photo.
 */
export async function prepareAvatar(file: File): Promise<AvatarImage> {
  if (!/^image\/(png|jpeg|webp|gif|heic|heif|avif)$/.test(file.type) && !/\.(png|jpe?g|webp|gif|heic|heif|avif)$/i.test(file.name))
    throw new Error("Choose a PNG, JPG or WebP image.");
  if (file.size > AVATAR_MAX_INPUT_BYTES) throw new Error("That image is too large. Choose one under 15 MB.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("We couldn't read that image. Try a PNG or JPG.");
  }
  const W = bitmap.width, H = bitmap.height;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("We couldn't read that image. Try a PNG or JPG.");
  ctx.imageSmoothingQuality = "high";
  if (hasTransparency(bitmap)) {
    // Logo: the whole image, centred within the circle's inner square (about 70% of the width).
    canvas.width = canvas.height = AVATAR_SIZE;
    const box = AVATAR_SIZE * 0.7, k = Math.min(box / W, box / H);
    const w = W * k, h = H * k;
    ctx.drawImage(bitmap, 0, 0, W, H, (AVATAR_SIZE - w) / 2, (AVATAR_SIZE - h) / 2, w, h);
  } else {
    const side = Math.min(W, H);
    canvas.width = canvas.height = Math.min(AVATAR_SIZE, side);
    ctx.drawImage(bitmap, (W - side) / 2, (H - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  }
  bitmap.close();
  const toBlob = (type: string, q?: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, q));
  const webp = await toBlob("image/webp", 0.9);
  // Browsers that can't write WebP (older Safari) hand back a PNG instead.
  if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp", contentType: "image/webp" };
  const png = await toBlob("image/png");
  if (!png) throw new Error("We couldn't read that image. Try a PNG or JPG.");
  return { blob: png, ext: "png", contentType: "image/png" };
}

/** Whether a meaningful part of the image is see-through (sampled on a small copy). */
function hasTransparency(bitmap: ImageBitmap): boolean {
  const n = 48, c = document.createElement("canvas");
  c.width = c.height = n;
  const x = c.getContext("2d", { willReadFrequently: true });
  if (!x) return false;
  x.drawImage(bitmap, 0, 0, n, n);
  const d = x.getImageData(0, 0, n, n).data;
  let clear = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 200) clear++;
  return clear > n * n * 0.04;
}
