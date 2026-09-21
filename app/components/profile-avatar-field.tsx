"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ProfileAvatar, profileColorOptions, profileIconOptions } from "./profile-avatar";
import { cropImageToWebp } from "./client-image-processing";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

export type ProfileAvatarFieldHandle = { appendTo(formData: FormData): Promise<void> };

type Props = {
  initialMode?: "preset" | "upload";
  initialIcon?: string | null;
  initialColor?: string | null;
  initialImageUrl?: string | null;
  legend?: string;
  className?: string;
};

async function cropImage(file: File, zoom: number, positionX: number, positionY: number) {
  return cropImageToWebp(file, 512, 512, { zoom, positionX, positionY }, "profile.webp", 0.88);
}

export const ProfileAvatarField = forwardRef<ProfileAvatarFieldHandle, Props>(function ProfileAvatarField({
  initialMode = "preset",
  initialIcon = "utensils",
  initialColor = "coral",
  initialImageUrl = null,
  legend = "プロフィール画像・アイコン",
  className = "profile-icon-editor",
}, ref) {
  const [mode, setMode] = useState<"preset" | "upload">(initialMode);
  const [icon, setIcon] = useState(initialIcon ?? "utensils");
  const [color, setColor] = useState(initialColor ?? "coral");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialImageUrl);
  const [zoom, setZoom] = useState(1);
  const [positionX, setPositionX] = useState(50);
  const [positionY, setPositionY] = useState(50);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (sourceFile && previewUrl) URL.revokeObjectURL(previewUrl);
  }, [sourceFile, previewUrl]);

  useImperativeHandle(ref, () => ({
    async appendTo(formData) {
      formData.set("avatar_mode", mode);
      formData.set("preset_avatar_key", icon);
      formData.set("avatar_color", color);
      if (mode === "upload" && sourceFile) {
        formData.set("avatar", await cropImage(sourceFile, zoom, positionX, positionY));
      }
    },
  }), [color, icon, mode, positionX, positionY, sourceFile, zoom]);

  function chooseFile(file: File | undefined) {
    if (!file) return;
    if (!ALLOWED_TYPES.has(file.type) || file.size > MAX_SOURCE_BYTES) {
      inputRef.current?.setCustomValidity("JPEG・PNG・WebP形式、5MB以下の画像を選んでください。");
      inputRef.current?.reportValidity();
      return;
    }
    inputRef.current?.setCustomValidity("");
    if (sourceFile && previewUrl) URL.revokeObjectURL(previewUrl);
    setSourceFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setMode("upload");
    setZoom(1);
    setPositionX(50);
    setPositionY(50);
  }

  return <fieldset className={className}>
    <legend>{legend}</legend>
    <div className="profile-avatar-preview">
      {mode === "upload" && previewUrl
        ? <span className="profile-crop-preview"><span style={{ backgroundImage: `url("${previewUrl.replaceAll('"', "%22")}")`, backgroundSize: `${zoom * 100}%`, backgroundPosition: `${positionX}% ${positionY}%` }} /></span>
        : <ProfileAvatar presetKey={icon} color={color} className="profile-avatar-large" />}
      <div><button className="outline-action" type="button" onClick={() => inputRef.current?.click()}>画像を選ぶ</button><small>JPEG・PNG・WebP、5MBまで</small></div>
      <input ref={inputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} />
    </div>
    {mode === "upload" && previewUrl ? <div className="profile-crop-controls">
      <label><span>拡大</span><input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
      <label><span>左右位置</span><input type="range" min="0" max="100" value={positionX} onChange={(event) => setPositionX(Number(event.target.value))} /></label>
      <label><span>上下位置</span><input type="range" min="0" max="100" value={positionY} onChange={(event) => setPositionY(Number(event.target.value))} /></label>
      <button className="text-action" type="button" onClick={() => setMode("preset")}>用意されたアイコンを使う</button>
    </div> : <>
      <div className="profile-icon-grid">{profileIconOptions.map(([key, label]) => <button key={key} type="button" className={icon === key ? "is-selected" : ""} aria-label={label} aria-pressed={icon === key} onClick={() => { setIcon(key); setMode("preset"); }}><ProfileAvatar presetKey={key} color={color} /></button>)}</div>
      <div className="profile-color-grid" aria-label="アイコンの色">{profileColorOptions.map((value) => <button key={value} type="button" data-color={value} className={color === value ? "is-selected" : ""} aria-label={`${value}色`} aria-pressed={color === value} onClick={() => setColor(value)} />)}</div>
    </>}
  </fieldset>;
});
