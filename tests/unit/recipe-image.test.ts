import { describe, expect, it } from "vitest";
import { stripWebpMetadata } from "../../app/components/client-image-processing";
import { MAX_RECIPE_IMAGE_SOURCE_BYTES, normalizeRecipeImage, normalizeRecipeStepImage } from "../../lib/recipe-image";

function fourCC(value: string) { return [...value].map((character) => character.charCodeAt(0)); }
function u32(value: number) { return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]; }
function u24(value: number) { return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255]; }

function webp(width: number, height: number, extra: Array<{ name: string; data: number[] }> = [], vp8xFlags = 0) {
  const vp8x = [vp8xFlags, 0, 0, 0, ...u24(width - 1), ...u24(height - 1)];
  const vp8 = [0, 0, 0, 0x9d, 0x01, 0x2a, width & 255, (width >>> 8) & 255, height & 255, (height >>> 8) & 255];
  const chunks = [{ name: "VP8X", data: vp8x }, { name: "VP8 ", data: vp8 }, ...extra];
  const body = chunks.flatMap(({ name, data }) => [...fourCC(name), ...u32(data.length), ...data, ...(data.length % 2 ? [0] : [])]);
  return new Blob([new Uint8Array([...fourCC("RIFF"), ...u32(body.length + 4), ...fourCC("WEBP"), ...body])], { type: "image/webp" });
}

describe("normalizeRecipeImage", () => {
  it("Canvas正規化済みの1200×750 WebPを受け入れる", async () => {
    const output = await normalizeRecipeImage(webp(1200, 750), { zoom: 1.25, positionX: 35, positionY: 65 });
    expect(output).toBeInstanceOf(ArrayBuffer);
  });

  it("Canvasが生成した透過対応WebPを受け入れる", async () => {
    await expect(normalizeRecipeImage(webp(1200, 750, [{ name: "ALPH", data: [0] }], 0x10), { zoom: 1, positionX: 50, positionY: 50 })).resolves.toBeInstanceOf(ArrayBuffer);
  });

  it("WebPではないデータを拒否する", async () => {
    await expect(normalizeRecipeImage(new Blob(["not-an-image"], { type: "image/webp" }), { zoom: 1, positionX: 50, positionY: 50 })).rejects.toThrow();
  });

  it("10MBを超える原画像を検証前に拒否する", async () => {
    const oversized = new Blob([new Uint8Array(MAX_RECIPE_IMAGE_SOURCE_BYTES + 1)], { type: "image/webp" });
    await expect(normalizeRecipeImage(oversized, { zoom: 1, positionX: 50, positionY: 50 })).rejects.toThrow("invalid image size");
  });

  it("範囲外の切り抜き指定を拒否する", async () => {
    await expect(normalizeRecipeImage(webp(1200, 750), { zoom: 4, positionX: 50, positionY: 50 })).rejects.toThrow("invalid recipe image zoom");
  });

  it("EXIFなどのメタデータチャンクを拒否する", async () => {
    await expect(normalizeRecipeImage(webp(1200, 750, [{ name: "EXIF", data: [1, 2] }]), { zoom: 1, positionX: 50, positionY: 50 })).rejects.toThrow("metadata");
  });

  it("Canvas出力に含まれるICCプロファイルを保存前に除去する", async () => {
    const source = await webp(1200, 750, [{ name: "ICCP", data: [1, 2, 3] }], 0x20).arrayBuffer();
    const sanitized = stripWebpMetadata(source);
    const text = new TextDecoder("ascii").decode(sanitized);
    expect(text).not.toContain("ICCP");
    await expect(normalizeRecipeImage(new Blob([sanitized], { type: "image/webp" }), { zoom: 1, positionX: 50, positionY: 50 })).resolves.toBeInstanceOf(ArrayBuffer);
  });
});

describe("normalizeRecipeStepImage", () => {
  it("Canvas正規化済みの960×720 WebPを受け入れる", async () => {
    await expect(normalizeRecipeStepImage(webp(960, 720))).resolves.toBeInstanceOf(ArrayBuffer);
  });
});
