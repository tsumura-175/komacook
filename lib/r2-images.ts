import "server-only";
import { getImageBucket, isSafeImageKey } from "./d1-bindings";

export function r2ImageUrl(key: string) {
  return `/api/images?key=${encodeURIComponent(key)}`;
}

export async function putR2Image(key: string, body: ArrayBuffer | Uint8Array | ReadableStream, contentType = "image/webp") {
  if (!isSafeImageKey(key)) throw new Error("INVALID_IMAGE_KEY");
  const bucket = await getImageBucket();
  await bucket.put(key, body, {
    httpMetadata: { contentType, cacheControl: "private, no-store" },
  });
}

export async function deleteR2Images(keys: string[]) {
  const validKeys = keys.filter(isSafeImageKey);
  if (!validKeys.length) return;
  const bucket = await getImageBucket();
  await bucket.delete(validKeys);
}

export async function moveR2Image(sourceKey: string, destinationKey: string) {
  if (!isSafeImageKey(sourceKey) || !isSafeImageKey(destinationKey)) throw new Error("INVALID_IMAGE_KEY");
  const bucket = await getImageBucket();
  const source = await bucket.get(sourceKey);
  if (!source) throw new Error("STAGED_IMAGE_NOT_FOUND");
  await bucket.put(destinationKey, source.body, {
    httpMetadata: { contentType: source.httpMetadata?.contentType ?? "image/webp", cacheControl: "private, no-store" },
  });
  await bucket.delete(sourceKey);
}
