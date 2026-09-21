import "server-only";

import { validateWebpImage } from "./webp-image";

export const MAX_AVATAR_SOURCE_BYTES = 5 * 1024 * 1024;

/** Canvasで正規化済みの512px WebPをWorkers側で再検証する。 */
export async function normalizeAvatarImage(file: File) {
  if (file.type !== "image/webp") throw new Error("invalid avatar format");
  return validateWebpImage(await file.arrayBuffer(), { width: 512, height: 512 }, MAX_AVATAR_SOURCE_BYTES);
}
