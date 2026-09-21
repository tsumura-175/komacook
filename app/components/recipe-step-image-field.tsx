"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCamera, faImage, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import Image from "next/image";
import { createClient } from "../../lib/supabase/client";
import { coverImageToWebp } from "./client-image-processing";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxSourceBytes = 10 * 1024 * 1024;

export type RecipeStepImageFieldHandle = {
  stageSource(formData: FormData): Promise<void>;
  discardStagedSource(): Promise<void>;
  markPersisted(): void;
};

type Props = { rowId: number; initialImageUrl?: string | null; onChange(): void };

export const RecipeStepImageField = forwardRef<RecipeStepImageFieldHandle, Props>(function RecipeStepImageField({ rowId, initialImageUrl = null, onChange }, ref) {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [hasPersistedImage, setHasPersistedImage] = useState(Boolean(initialImageUrl));
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const stagedPathRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => { if (initialImageUrl) setHasPersistedImage(true); }, [initialImageUrl]);

  useImperativeHandle(ref, () => ({
    async stageSource(formData) {
      if (!sourceFile || !dirtyRef.current) return;
      const normalized = await coverImageToWebp(sourceFile, 960, 720, "recipe-step.webp", 0.84);
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("ログインが必要です。");
      const stagedPath = `${data.user.id}/staging/${crypto.randomUUID()}.webp`;
      const { error: uploadError } = await supabase.storage.from("recipe-images").upload(stagedPath, normalized, { contentType: "image/webp", upsert: false });
      if (uploadError) throw new Error("工程写真を一時保存できませんでした。もう一度お試しください。");
      stagedPathRef.current = stagedPath;
      formData.set(`step_image_staged_${rowId}`, stagedPath);
    },
    async discardStagedSource() {
      if (!stagedPathRef.current) return;
      const stagedPath = stagedPathRef.current;
      stagedPathRef.current = null;
      await createClient().storage.from("recipe-images").remove([stagedPath]);
    },
    markPersisted() {
      dirtyRef.current = false;
      if (sourceFile) setHasPersistedImage(true);
      else if (removed) setHasPersistedImage(false);
    },
  }), [removed, rowId, sourceFile]);

  function openPicker() { if (inputRef.current) { inputRef.current.value = ""; inputRef.current.click(); } }
  function clearImage() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null); setSourceFile(null); setRemoved(hasPersistedImage); setError(""); dirtyRef.current = true; onChange();
  }
  function chooseFile(file: File | undefined) {
    if (!file) return;
    if (!allowedTypes.has(file.type) || file.size < 1 || file.size > maxSourceBytes) { setError("JPEG・PNG・WebP形式、10MB以下の画像を選んでください。"); return; }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file)); setSourceFile(file); setRemoved(false); setError(""); dirtyRef.current = true; onChange();
  }
  const shownUrl = previewUrl ?? (initialImageUrl && !removed ? initialImageUrl : null);

  return <div className="step-image-editor">
    <input ref={inputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" aria-label="工程写真を選択" onChange={(event) => chooseFile(event.target.files?.[0])} />
    {shownUrl ? <div className="step-image-preview"><Image src={shownUrl} alt="工程写真のプレビュー" fill sizes="(max-width: 760px) calc(100vw - 5.5rem), 36rem" unoptimized={Boolean(previewUrl)} /><span><FontAwesomeIcon icon={faImage} />工程写真</span></div> : null}
    <div className="step-image-actions">
      <button className="outline-action" type="button" onClick={openPicker}><FontAwesomeIcon icon={faCamera} />{shownUrl ? "写真を変更" : "工程写真を追加"}</button>
      {shownUrl ? <button className="recipe-image-delete" type="button" onClick={clearImage}><FontAwesomeIcon icon={faTrashCan} />削除</button> : null}
    </div>
    {removed ? <p className="recipe-image-removed" role="status">保存すると工程写真を削除します。</p> : null}
    {error ? <p className="recipe-image-error" role="alert">{error}</p> : null}
  </div>;
});
