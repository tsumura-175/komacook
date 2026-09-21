"use client";

import { useRef, useState } from "react";
import { ProfileAvatarField, ProfileAvatarFieldHandle } from "../components/profile-avatar-field";
import { updateProfile } from "./actions";

type Profile = {
  display_name: string;
  standard_servings: number;
  family_adults: number | null;
  family_children: number | null;
  show_family: boolean;
  avatar_kind: string;
  preset_avatar_key: string | null;
  avatar_color: string | null;
  avatar_path: string | null;
};

export function ProfileEditor({ profile, avatarUrl }: { profile: Profile | null; avatarUrl: string | null }) {
  const [busy, setBusy] = useState(false);
  const avatarRef = useRef<ProfileAvatarFieldHandle>(null);

  async function submit(formData: FormData) {
    setBusy(true);
    try {
      await avatarRef.current?.appendTo(formData);
      await updateProfile(formData);
    } finally {
      setBusy(false);
    }
  }

  return <form action={submit} className="settings-profile-form">
    <h2>プロフィール</h2>
    <ProfileAvatarField
      ref={avatarRef}
      initialMode={profile?.avatar_kind === "upload" ? "upload" : "preset"}
      initialIcon={profile?.preset_avatar_key}
      initialColor={profile?.avatar_color}
      initialImageUrl={avatarUrl}
    />
    <label className="form-field"><span>表示名</span><input name="display_name" defaultValue={profile?.display_name ?? ""} maxLength={30} required /></label>
    <label className="form-field"><span>標準人数</span><div className="field-with-unit"><input name="servings" type="number" defaultValue={profile?.standard_servings ?? 2} min={1} max={20} required /><span>人分</span></div></label>
    <fieldset className="settings-family-fieldset">
      <legend>家族構成</legend>
      <p>人数だけを登録します。名前や年齢は保存しません。</p>
      <div className="settings-family-grid">
        <label className="form-field"><span>大人</span><div className="field-with-unit"><input name="family_adults" type="number" defaultValue={profile?.family_adults ?? ""} min={0} max={20} placeholder="未登録" /><span>人</span></div></label>
        <label className="form-field"><span>子ども</span><div className="field-with-unit"><input name="family_children" type="number" defaultValue={profile?.family_children ?? ""} min={0} max={20} placeholder="未登録" /><span>人</span></div></label>
      </div>
      <div className="settings-family-visibility">
        <label><input type="radio" name="show_family" value="false" defaultChecked={!profile?.show_family} /><span><strong>非公開</strong><small>自分だけが確認できます</small></span></label>
        <label><input type="radio" name="show_family" value="true" defaultChecked={profile?.show_family} /><span><strong>公開</strong><small>公開プロフィールに人数を表示します</small></span></label>
      </div>
    </fieldset>
    <button className="primary-action" type="submit" disabled={busy}>{busy ? "保存中…" : "変更を保存"}</button>
  </form>;
}
