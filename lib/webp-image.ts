/** Workersでも実行できる、Canvas生成済みWebPの構造検証。 */
type ImageSize = { width: number; height: number };

const text = new TextDecoder("ascii");
const forbiddenChunks = new Set(["EXIF", "XMP ", "ICCP"]);
const permittedChunks = new Set(["VP8 ", "VP8L", "VP8X", "ALPH"]);

function readU24(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readU32(bytes: Uint8Array, offset: number) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function fourCC(bytes: Uint8Array, offset: number) {
  return text.decode(bytes.subarray(offset, offset + 4));
}

function vp8Size(bytes: Uint8Array, offset: number, length: number): ImageSize | null {
  if (length < 10 || bytes[offset + 3] !== 0x9d || bytes[offset + 4] !== 0x01 || bytes[offset + 5] !== 0x2a) return null;
  return {
    width: (bytes[offset + 6] | (bytes[offset + 7] << 8)) & 0x3fff,
    height: (bytes[offset + 8] | (bytes[offset + 9] << 8)) & 0x3fff,
  };
}

function vp8lSize(bytes: Uint8Array, offset: number, length: number): ImageSize | null {
  if (length < 5 || bytes[offset] !== 0x2f) return null;
  const packed = readU32(bytes, offset + 1);
  return { width: (packed & 0x3fff) + 1, height: ((packed >>> 14) & 0x3fff) + 1 };
}

export function validateWebpImage(source: ArrayBuffer, expected: ImageSize, maxBytes: number) {
  const bytes = new Uint8Array(source);
  if (bytes.byteLength < 20 || bytes.byteLength > maxBytes) throw new Error("invalid image size");
  if (fourCC(bytes, 0) !== "RIFF" || fourCC(bytes, 8) !== "WEBP" || readU32(bytes, 4) + 8 !== bytes.byteLength) {
    throw new Error("invalid webp container");
  }

  let offset = 12;
  let size: ImageSize | null = null;
  let imageChunkFound = false;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) throw new Error("invalid webp chunk");
    const chunk = fourCC(bytes, offset);
    const length = readU32(bytes, offset + 4);
    const dataOffset = offset + 8;
    const end = dataOffset + length;
    if (end > bytes.byteLength || !Number.isSafeInteger(end)) throw new Error("invalid webp chunk length");
    if (forbiddenChunks.has(chunk) || !permittedChunks.has(chunk)) throw new Error("webp metadata is not allowed");

    if (chunk === "VP8X") {
      // VP8X の機能ビットだけではメタデータの有無を判定できない。
      // 実体のチャンクを許可リストで検査しているため、Canvas 実装ごとの
      // ビット差異は許可し、EXIF / XMP / ICC / animation の実データは拒否する。
      if (length !== 10) throw new Error("invalid extended webp header");
      size = { width: readU24(bytes, dataOffset + 4) + 1, height: readU24(bytes, dataOffset + 7) + 1 };
    } else if (chunk === "VP8 ") {
      const parsed = vp8Size(bytes, dataOffset, length);
      if (!parsed) throw new Error("invalid webp image data");
      size ??= parsed;
      imageChunkFound = true;
    } else if (chunk === "VP8L") {
      const parsed = vp8lSize(bytes, dataOffset, length);
      if (!parsed) throw new Error("invalid webp image data");
      size ??= parsed;
      imageChunkFound = true;
    }
    offset = end + (length % 2);
  }
  if (offset !== bytes.byteLength || !imageChunkFound || !size || size.width !== expected.width || size.height !== expected.height) {
    throw new Error("unexpected webp dimensions");
  }
  return source;
}
