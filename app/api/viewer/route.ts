import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { getD1Database, usesD1AppData } from "../../../lib/d1-bindings";
import { d1AvatarUrl, getD1Profile } from "../../../lib/d1-profiles";

export const runtime = "edge";

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ signedIn: false });
  if (usesD1AppData()) {
    const [profile, unread] = await Promise.all([
      getD1Profile(data.user.id),
      (await getD1Database()).prepare("SELECT COUNT(*) AS count FROM user_notifications WHERE user_id = ? AND read_at IS NULL").bind(data.user.id).first<{ count: number }>(),
    ]);
    return NextResponse.json({ signedIn: true, displayName: profile?.display_name ?? "マイページ", hasUnreadNotification: Number(unread?.count ?? 0) > 0, avatarKind: profile?.avatar_kind, presetKey: profile?.preset_avatar_key, color: profile?.avatar_color, avatarUrl: d1AvatarUrl(profile) });
  }
  const [{ data: profile }, { count: unreadCount }] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_kind, preset_avatar_key, avatar_color, avatar_path").eq("user_id", data.user.id).maybeSingle(),
    supabase.from("user_notifications").select("id", { count: "exact", head: true }).eq("user_id", data.user.id).is("read_at", null),
  ]);
  const avatarUrl = profile?.avatar_path ? (await supabase.storage.from("avatars").createSignedUrl(profile.avatar_path, 3600)).data?.signedUrl ?? null : null;
  return NextResponse.json({ signedIn: true, displayName: profile?.display_name ?? "マイページ", hasUnreadNotification: (unreadCount ?? 0) > 0, avatarKind: profile?.avatar_kind, presetKey: profile?.preset_avatar_key, color: profile?.avatar_color, avatarUrl });
}
