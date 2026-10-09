import { describe, expect, it } from "vitest";
import { isSafeImageKey } from "../../lib/d1-bindings";

const ownerId = "d65948e1-f35b-4e58-8b13-25efc6764e2d";
const recipeId = "8b3c803c-5ced-4796-b8a2-80927c9e7bb1";
const imageId = "561fe12f-8c37-4e92-8b76-4b46c8435633";

describe("R2画像キーの検証", () => {
  it("完成写真・工程写真・一時画像の正規キーを受け入れる", () => {
    expect(isSafeImageKey(`${ownerId}/${recipeId}/${imageId}.webp`)).toBe(true);
    expect(isSafeImageKey(`${ownerId}/${recipeId}/steps/${imageId}.webp`)).toBe(true);
    expect(isSafeImageKey(`${ownerId}/staging/${imageId}.webp`)).toBe(true);
    expect(isSafeImageKey(`${ownerId}/avatar-${imageId}.webp`)).toBe(true);
  });

  it("任意パスや拡張子は受け入れない", () => {
    expect(isSafeImageKey(`${ownerId}/${recipeId}/../../private.txt`)).toBe(false);
    expect(isSafeImageKey(`${ownerId}/${recipeId}/${imageId}.png`)).toBe(false);
  });
});
