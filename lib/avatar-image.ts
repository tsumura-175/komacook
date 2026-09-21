import "server-only";

import sharp from "sharp";

export const MAX_AVATAR_SOURCE_BYTES = 5 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

export async function normalizeAvatarImage(file: File) {
  if (file.size < 1 || file.size > MAX_AVATAR_SOURCE_BYTES) {
    throw new Error("invalid avatar size");
  }

  const source = Buffer.from(await file.arrayBuffer());
  const image = sharp(source, { failOn: "error", limitInputPixels: 40_000_000 });
  const metadata = await image.metadata();
  if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format) || !metadata.width || !metadata.height) {
    throw new Error("invalid avatar format");
  }

  return image
    .rotate()
    .resize(512, 512, { fit: "cover", position: "centre" })
    .webp({ quality: 88 })
    .toBuffer();
}
