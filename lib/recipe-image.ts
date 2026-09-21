import "server-only";

import sharp, { type Metadata } from "sharp";

export const MAX_RECIPE_IMAGE_SOURCE_BYTES = 10 * 1024 * 1024;
export const RECIPE_IMAGE_WIDTH = 1200;
export const RECIPE_IMAGE_HEIGHT = 750;
export const RECIPE_STEP_IMAGE_WIDTH = 960;
export const RECIPE_STEP_IMAGE_HEIGHT = 720;
const MAX_INPUT_PIXELS = 60_000_000;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

export type RecipeImageCrop = {
  zoom: number;
  positionX: number;
  positionY: number;
};

function orientedDimensions(metadata: Metadata) {
  if (!metadata.width || !metadata.height) throw new Error("invalid recipe image dimensions");
  const swapsAxes = metadata.orientation !== undefined && metadata.orientation >= 5 && metadata.orientation <= 8;
  return swapsAxes
    ? { width: metadata.height, height: metadata.width }
    : { width: metadata.width, height: metadata.height };
}

export async function normalizeRecipeImage(file: Blob, crop: RecipeImageCrop) {
  if (file.size < 1 || file.size > MAX_RECIPE_IMAGE_SOURCE_BYTES) {
    throw new Error("invalid recipe image size");
  }
  if (!Number.isFinite(crop.zoom) || crop.zoom < 1 || crop.zoom > 3) {
    throw new Error("invalid recipe image zoom");
  }
  if (![crop.positionX, crop.positionY].every((value) => Number.isFinite(value) && value >= 0 && value <= 100)) {
    throw new Error("invalid recipe image position");
  }

  const source = Buffer.from(await file.arrayBuffer());
  const image = sharp(source, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS });
  const metadata = await image.metadata();
  if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
    throw new Error("invalid recipe image format");
  }

  const { width, height } = orientedDimensions(metadata);
  const targetRatio = RECIPE_IMAGE_WIDTH / RECIPE_IMAGE_HEIGHT;
  const sourceRatio = width / height;
  const baseCropWidth = sourceRatio > targetRatio ? height * targetRatio : width;
  const baseCropHeight = sourceRatio > targetRatio ? height : width / targetRatio;
  const cropWidth = Math.max(1, Math.min(width, Math.round(baseCropWidth / crop.zoom)));
  const cropHeight = Math.max(1, Math.min(height, Math.round(baseCropHeight / crop.zoom)));
  const left = Math.max(0, Math.min(width - cropWidth, Math.round((width - cropWidth) * crop.positionX / 100)));
  const top = Math.max(0, Math.min(height - cropHeight, Math.round((height - cropHeight) * crop.positionY / 100)));

  return image
    .rotate()
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .resize(RECIPE_IMAGE_WIDTH, RECIPE_IMAGE_HEIGHT, { fit: "fill" })
    .webp({ quality: 86, effort: 4 })
    .toBuffer();
}

/** 工程写真は利用者の切り抜き操作を省き、中央基準の4:3に正規化する。 */
export async function normalizeRecipeStepImage(file: Blob) {
  if (file.size < 1 || file.size > MAX_RECIPE_IMAGE_SOURCE_BYTES) throw new Error("invalid recipe step image size");
  const source = Buffer.from(await file.arrayBuffer());
  const image = sharp(source, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS });
  const metadata = await image.metadata();
  if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) throw new Error("invalid recipe step image format");
  return image
    .rotate()
    .resize(RECIPE_STEP_IMAGE_WIDTH, RECIPE_STEP_IMAGE_HEIGHT, { fit: "cover", position: "centre" })
    .webp({ quality: 84, effort: 4 })
    .toBuffer();
}
