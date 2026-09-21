import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MAX_RECIPE_IMAGE_SOURCE_BYTES, normalizeRecipeImage, normalizeRecipeStepImage } from "../../lib/recipe-image";

describe("normalizeRecipeImage", () => {
  it("8:5の1200×750 WebPへ変換し、メタデータを除去する", async () => {
    const source = await sharp({ create: { width: 900, height: 1200, channels: 3, background: "#c46a4a" } })
      .withMetadata({ orientation: 6 })
      .jpeg({ quality: 90 })
      .toBuffer();

    const output = await normalizeRecipeImage(new Blob([source]), { zoom: 1.25, positionX: 35, positionY: 65 });
    const metadata = await sharp(output).metadata();

    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(1200);
    expect(metadata.height).toBe(750);
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
  });

  it("画像としてデコードできないデータを拒否する", async () => {
    await expect(normalizeRecipeImage(new Blob(["not-an-image"]), { zoom: 1, positionX: 50, positionY: 50 })).rejects.toThrow();
  });

  it("10MBを超える原画像をデコード前に拒否する", async () => {
    const oversized = new Blob([new Uint8Array(MAX_RECIPE_IMAGE_SOURCE_BYTES + 1)]);
    await expect(normalizeRecipeImage(oversized, { zoom: 1, positionX: 50, positionY: 50 })).rejects.toThrow("invalid recipe image size");
  });

  it("範囲外の切り抜き指定を拒否する", async () => {
    const source = await sharp({ create: { width: 20, height: 20, channels: 3, background: "white" } }).png().toBuffer();
    await expect(normalizeRecipeImage(new Blob([source]), { zoom: 4, positionX: 50, positionY: 50 })).rejects.toThrow("invalid recipe image zoom");
  });
});

describe("normalizeRecipeStepImage", () => {
  it("工程写真を4:3のWebPへ正規化し、メタデータを除去する", async () => {
    const source = await sharp({ create: { width: 700, height: 1200, channels: 3, background: "#6f8f65" } }).withMetadata({ orientation: 6 }).png().toBuffer();
    const output = await normalizeRecipeStepImage(new Blob([source]));
    const metadata = await sharp(output).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 960, height: 720 });
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.exif).toBeUndefined();
  });
});
