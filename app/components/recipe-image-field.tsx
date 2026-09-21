"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCamera, faImage, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import { cropImageToWebp } from "./client-image-processing";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const PREVIEW_WIDTH = 1200;
const PREVIEW_HEIGHT = 750;

type Props = {
  initialImageUrl?: string | null;
  onChange?(): void;
};

export type RecipeImageFieldHandle = {
  stageSource(formData: FormData): Promise<void>;
  discardStagedSource(): Promise<void>;
  markPersisted(): void;
};

export const RecipeImageField = forwardRef<RecipeImageFieldHandle, Props>(function RecipeImageField({ initialImageUrl = null, onChange }, ref) {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [hasPersistedImage, setHasPersistedImage] = useState(Boolean(initialImageUrl));
  const [removed, setRemoved] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [positionX, setPositionX] = useState(50);
  const [positionY, setPositionY] = useState(50);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const stagedPathRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => () => bitmapRef.current?.close(), []);
  useEffect(() => {
    if (initialImageUrl) setHasPersistedImage(true);
  }, [initialImageUrl]);

  useEffect(() => {
    const bitmap = bitmapRef.current;
    const canvas = canvasRef.current;
    if (!sourceFile || !bitmap || !canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const scale = Math.max(PREVIEW_WIDTH / bitmap.width, PREVIEW_HEIGHT / bitmap.height) * zoom;
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    context.drawImage(bitmap, (PREVIEW_WIDTH - width) * positionX / 100, (PREVIEW_HEIGHT - height) * positionY / 100, width, height);
  }, [positionX, positionY, sourceFile, zoom]);

  useImperativeHandle(ref, () => ({
    async stageSource(formData) {
      formData.delete("image");
      // sourceFile がある間は、明示保存時に必ずステージングする。親の再描画で
      // フィールド参照が更新されても、選択済みの完成写真を取りこぼさないため。
      if (!sourceFile) return;
      const normalized = await cropImageToWebp(
        sourceFile,
        PREVIEW_WIDTH,
        PREVIEW_HEIGHT,
        { zoom, positionX, positionY },
        "recipe.webp",
        0.86,
      );
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("ログインが必要です。");
      const stagedPath = `${data.user.id}/staging/${crypto.randomUUID()}.webp`;
      const { error: uploadError } = await supabase.storage.from("recipe-images").upload(stagedPath, normalized, { contentType: "image/webp", upsert: false });
      if (uploadError) throw new Error("画像を一時保存できませんでした。もう一度お試しください。");
      stagedPathRef.current = stagedPath;
      formData.set("staged_image_path", stagedPath);
    },
    async discardStagedSource() {
      const stagedPath = stagedPathRef.current;
      if (!stagedPath) return;
      stagedPathRef.current = null;
      const supabase = createClient();
      await supabase.storage.from("recipe-images").remove([stagedPath]);
    },
    markPersisted() {
      dirtyRef.current = false;
      if (sourceFile) setHasPersistedImage(true);
      else if (removed) setHasPersistedImage(false);
    },
  }), [positionX, positionY, removed, sourceFile, zoom]);

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    if (!ALLOWED_TYPES.has(file.type) || file.size < 1 || file.size > MAX_SOURCE_BYTES) {
      const message = "JPEG・PNG・WebP形式、10MB以下の画像を選んでください。";
      setError(message);
      inputRef.current?.setCustomValidity(message);
      inputRef.current?.reportValidity();
      return;
    }
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      bitmapRef.current?.close();
      bitmapRef.current = bitmap;
      inputRef.current?.setCustomValidity("");
      setError("");
      setSourceFile(file);
      setRemoved(false);
      setZoom(1);
      setPositionX(50);
      setPositionY(50);
      dirtyRef.current = true;
      onChange?.();
    } catch {
      const message = "画像を読み取れませんでした。別の画像を選んでください。";
      setError(message);
      inputRef.current?.setCustomValidity(message);
      inputRef.current?.reportValidity();
    }
  }

  function clearImage() {
    bitmapRef.current?.close();
    bitmapRef.current = null;
    setSourceFile(null);
    setRemoved(hasPersistedImage);
    setError("");
    dirtyRef.current = true;
    onChange?.();
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.setCustomValidity("");
    }
  }

  function openFilePicker() {
    if (!inputRef.current) return;
    inputRef.current.value = "";
    inputRef.current.click();
  }

  const hasImage = Boolean(sourceFile || (initialImageUrl && !removed));

  return <fieldset className="recipe-image-editor">
    <legend>完成写真</legend>
    <input type="hidden" name="image_crop_zoom" value={zoom} />
    <input type="hidden" name="image_crop_x" value={positionX} />
    <input type="hidden" name="image_crop_y" value={positionY} />
    <input type="hidden" name="remove_image" value={removed ? "true" : "false"} />

    {hasImage ? <div className="recipe-image-preview">
      {sourceFile
        ? <canvas ref={canvasRef} width={PREVIEW_WIDTH} height={PREVIEW_HEIGHT} role="img" aria-label="完成写真の切り抜きプレビュー" />
        : <span className="recipe-current-image" role="img" aria-label="現在の完成写真" style={{ backgroundImage: `url("${initialImageUrl!.replaceAll('"', "%22")}")` }} />}
      <span><FontAwesomeIcon icon={faImage} />8:5で保存される範囲</span>
    </div> : <button className="recipe-image-empty" type="button" onClick={openFilePicker}>
      <FontAwesomeIcon icon={faCamera} />
      <span><strong>完成写真を選択</strong><small>JPEG・PNG・WebP、10MBまで</small></span>
    </button>}

    <input ref={inputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void chooseFile(event.target.files?.[0])} />

    {sourceFile ? <div className="recipe-crop-controls">
      <p>枠内を確認しながら、拡大率と位置を調整してください。</p>
      <label><span>拡大</span><input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => { setZoom(Number(event.target.value)); dirtyRef.current = true; onChange?.(); }} /></label>
      <label><span>左右位置</span><input type="range" min="0" max="100" value={positionX} onChange={(event) => { setPositionX(Number(event.target.value)); dirtyRef.current = true; onChange?.(); }} /></label>
      <label><span>上下位置</span><input type="range" min="0" max="100" value={positionY} onChange={(event) => { setPositionY(Number(event.target.value)); dirtyRef.current = true; onChange?.(); }} /></label>
    </div> : null}

    {hasImage ? <div className="recipe-image-actions">
      <button className="outline-action" type="button" onClick={openFilePicker}><FontAwesomeIcon icon={faCamera} />写真を変更</button>
      <button className="recipe-image-delete" type="button" onClick={clearImage}><FontAwesomeIcon icon={faTrashCan} />写真を削除</button>
    </div> : removed ? <p className="recipe-image-removed" role="status">保存すると現在の完成写真を削除します。別の写真も選べます。</p> : null}
    {error ? <p className="recipe-image-error" role="alert">{error}</p> : null}
  </fieldset>;
});
