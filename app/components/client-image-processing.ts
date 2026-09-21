"use client";

type Crop = { zoom: number; positionX: number; positionY: number };

async function canvasToWebp(canvas: HTMLCanvasElement, name: string, quality: number) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("画像をWebPへ変換できませんでした。")), "image/webp", quality);
  });
  return new File([blob], name, { type: "image/webp" });
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
