"use client";

type Crop = { zoom: number; positionX: number; positionY: number };

const webpMetadataChunks = new Set(["EXIF", "XMP ", "ICCP"]);

function fourCC(bytes: Uint8Array, offset: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

function readU32(bytes: Uint8Array, offset: number) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function writeU32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 255;
  bytes[offset + 1] = (value >>> 8) & 255;
  bytes[offset + 2] = (value >>> 16) & 255;
  bytes[offset + 3] = (value >>> 24) & 255;
}

/** Canvasが付与するICCプロファイルなどを除去する。保存時にはサーバーでも再検証する。 */
export function stripWebpMetadata(source: ArrayBuffer) {
  const input = new Uint8Array(source);
  if (input.byteLength < 20 || fourCC(input, 0) !== "RIFF" || fourCC(input, 8) !== "WEBP" || readU32(input, 4) + 8 !== input.byteLength) {
    throw new Error("画像をWebPへ変換できませんでした。");
  }

  const chunks: Uint8Array[] = [];
  let offset = 12;
  while (offset < input.byteLength) {
    if (offset + 8 > input.byteLength) throw new Error("画像をWebPへ変換できませんでした。");
    const length = readU32(input, offset + 4);
    const end = offset + 8 + length;
    const paddedEnd = end + (length % 2);
    if (paddedEnd > input.byteLength) throw new Error("画像をWebPへ変換できませんでした。");
    const name = fourCC(input, offset);
    if (name === "VP8X") {
      if (length !== 10) throw new Error("画像をWebPへ変換できませんでした。");
      const header = input.slice(offset, paddedEnd);
      // ICCP / EXIF / XMP の存在を示すビットを落とす。透過ビットは保持する。
      header[8] &= ~0x2c;
      chunks.push(header);
    } else if (!webpMetadataChunks.has(name)) {
      chunks.push(input.slice(offset, paddedEnd));
    }
    offset = paddedEnd;
  }
  if (offset !== input.byteLength) throw new Error("画像をWebPへ変換できませんでした。");

  const bodyLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(12 + bodyLength);
  output.set(input.subarray(0, 4), 0);
  output.set(input.subarray(8, 12), 8);
  writeU32(output, 4, output.byteLength - 8);
  let destination = 12;
  for (const chunk of chunks) {
    output.set(chunk, destination);
    destination += chunk.byteLength;
  }
  return output;
}

async function canvasToWebp(canvas: HTMLCanvasElement, name: string, quality: number) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("画像をWebPへ変換できませんでした。")), "image/webp", quality);
  });
  return new File([stripWebpMetadata(await blob.arrayBuffer())], name, { type: "image/webp" });
}

export async function cropImageToWebp(file: File, width: number, height: number, crop: Crop, name: string, quality: number) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("画像を処理できませんでした。");

    const scale = Math.max(width / bitmap.width, height / bitmap.height) * crop.zoom;
    const renderedWidth = bitmap.width * scale;
    const renderedHeight = bitmap.height * scale;
    context.drawImage(
      bitmap,
      (width - renderedWidth) * crop.positionX / 100,
      (height - renderedHeight) * crop.positionY / 100,
      renderedWidth,
      renderedHeight,
    );
    return await canvasToWebp(canvas, name, quality);
  } finally {
    bitmap.close();
  }
}

export async function coverImageToWebp(file: File, width: number, height: number, name: string, quality: number) {
  return cropImageToWebp(file, width, height, { zoom: 1, positionX: 50, positionY: 50 }, name, quality);
}
