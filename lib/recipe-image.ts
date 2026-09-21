import "server-only";

import { validateWebpImage } from "./webp-image";

export const MAX_RECIPE_IMAGE_SOURCE_BYTES = 10 * 1024 * 1024;
export const RECIPE_IMAGE_WIDTH = 1200;
export const RECIPE_IMAGE_HEIGHT = 750;
export const RECIPE_STEP_IMAGE_WIDTH = 960;
export const RECIPE_STEP_IMAGE_HEIGHT = 720;

export type RecipeImageCrop = {
  zoom: number;
  positionX: number;
  positionY: number;
};

/**
 * Workers Freeではネイティブ画像ライブラリを実行できないため、クライアントCanvasで
 * WebP化済みの画像だけを受け入れる。コンテナ、寸法、メタデータチャンクはサーバーで再検証する。
 */
export async function normalizeRecipeImage(file: Blob, crop: RecipeImageCrop) {
  if (!Number.isFinite(crop.zoom) || crop.zoom < 1 || crop.zoom > 3) throw new Error("invalid recipe image zoom");
  if (![crop.positionX, crop.positionY].every((value) => Number.isFinite(value) && value >= 0 && value <= 100)) {
    throw new Error("invalid recipe image position");
  }
  if (file.type !== "image/webp") throw new Error("invalid recipe image format");
  return validateWebpImage(await file.arrayBuffer(), { width: RECIPE_IMAGE_WIDTH, height: RECIPE_IMAGE_HEIGHT }, MAX_RECIPE_IMAGE_SOURCE_BYTES);
}

export async function normalizeRecipeStepImage(file: Blob) {
  if (file.type !== "image/webp") throw new Error("invalid recipe step image format");
  return validateWebpImage(await file.arrayBuffer(), { width: RECIPE_STEP_IMAGE_WIDTH, height: RECIPE_STEP_IMAGE_HEIGHT }, MAX_RECIPE_IMAGE_SOURCE_BYTES);
}
