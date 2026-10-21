"use client";

import { paletteFromPixels } from "./color";

export type ProcessedImage = { blob: Blob; ext: "webp" | "png" | "jpg"; contentType: string; width: number; height: number; palette: string[]; name: string };

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("That file isn't an image this browser can open. Try a PNG or JPG."));
    i.src = url;
  });
}

function toBlob(c: HTMLCanvasElement, type: string, q?: number): Promise<Blob | null> {
  return new Promise((res) => c.toBlob(res, type, q));
}

/**
 * Prepares artwork for upload: checks type and size, scales it to at most `maxW` wide and re-encodes it.
 * SVG files are drawn as images (scripts never run in an <img>) and saved as PNG, so no SVG is ever uploaded.
 */
export async function processImage(file: File, maxW = 1600): Promise<ProcessedImage> {
  let type = file.type;
  if (!type && /\.svg$/i.test(file.name)) type = "image/svg+xml";
  if (!ALLOWED.includes(type)) throw new Error("Use a PNG, JPG, WebP or SVG image.");
  const limit = type === "image/svg+xml" ? 1e6 : 10e6;
  if (file.size > limit) throw new Error(`That file is ${(file.size / 1e6).toFixed(1)} MB. ${type === "image/svg+xml" ? "SVG files" : "Images"} can be up to ${limit / 1e6} MB.`);

  const url = URL.createObjectURL(type === "image/svg+xml" ? new Blob([await file.text()], { type: "image/svg+xml" }) : file);
  try {
    const img = await loadImg(url);
    const nw = img.naturalWidth || 1200, nh = img.naturalHeight || 500;
    const w = Math.max(1, Math.min(maxW, nw)), h = Math.max(1, Math.round((w * nh) / nw));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    if (!g) throw new Error("This browser couldn't prepare the image.");
    g.drawImage(img, 0, 0, w, h);

    const small = document.createElement("canvas");
    small.width = 80; small.height = Math.max(1, Math.round((80 * h) / w));
    const sg = small.getContext("2d")!;
    sg.drawImage(c, 0, 0, small.width, small.height);
    const palette = paletteFromPixels(sg.getImageData(0, 0, small.width, small.height).data);

    let blob: Blob | null = null, ext: ProcessedImage["ext"] = "webp", contentType = "image/webp";
    if (type === "image/jpeg") { blob = await toBlob(c, "image/jpeg", 0.86); ext = "jpg"; contentType = "image/jpeg"; }
    else if (type === "image/svg+xml") { blob = await toBlob(c, "image/png"); ext = "png"; contentType = "image/png"; }
    else blob = await toBlob(c, "image/webp", 0.9);
    if (!blob || blob.type !== contentType) { blob = await toBlob(c, "image/png"); ext = "png"; contentType = "image/png"; }
    if (!blob) throw new Error("This browser couldn't prepare the image.");
    if (blob.size > 10e6) throw new Error("That image is still over 10 MB after resizing. Try a smaller file.");
    return { blob, ext, contentType, width: w, height: h, palette, name: file.name.slice(0, 120) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
