import "server-only";
import { getD1Database } from "./d1-bindings";
import { deleteR2Images, r2ImageUrl } from "./r2-images";

export type D1Profile = {
  user_id: string;
  display_name: string;
  standard_servings: number;
  family_adults: number | null;
  family_children: number | null;
  show_family: number;
  avatar_kind: "preset" | "upload";
  preset_avatar_key: string;
  avatar_color: string;
  avatar_key: string | null;
  account_status: "active" | "suspended" | "deletion_pending";
  onboarding_completed: number;
};

export async function getD1Profile(userId: string) {
  const db = await getD1Database();
  return db.prepare(`SELECT user_id, display_name, standard_servings, family_adults, family_children, show_family, avatar_kind, preset_avatar_key, avatar_color, avatar_key, account_status, onboarding_completed
    FROM profiles WHERE user_id = ?`).bind(userId).first<D1Profile>();
}

export async function ensureD1Profile(userId: string, fallbackName = "こまクックユーザー") {
  const db = await getD1Database();
  await db.prepare("INSERT OR IGNORE INTO profiles (user_id, display_name) VALUES (?, ?)").bind(userId, fallbackName.slice(0, 30) || "こまクックユーザー").run();
  return getD1Profile(userId);
}

export function d1AvatarUrl(profile: Pick<D1Profile, "avatar_kind" | "avatar_key"> | null) {
  return profile?.avatar_kind === "upload" && profile.avatar_key ? r2ImageUrl(profile.avatar_key) : null;
}

export async function updateD1Profile(userId: string, values: {
  displayName: string; servings: number; adults: number | null; children: number | null; showFamily: boolean;
  avatarKind: "preset" | "upload"; presetAvatarKey: string; avatarColor: string; avatarKey: string | null; onboardingCompleted?: boolean;
}) {
  const db = await getD1Database();
  const result = await db.prepare(`UPDATE profiles SET display_name = ?, standard_servings = ?, family_adults = ?, family_children = ?, show_family = ?, avatar_kind = ?, preset_avatar_key = ?, avatar_color = ?, avatar_key = ?, onboarding_completed = COALESCE(?, onboarding_completed), updated_at = ? WHERE user_id = ?`)
    .bind(values.displayName, values.servings, values.adults, values.children, values.showFamily ? 1 : 0, values.avatarKind, values.presetAvatarKey, values.avatarColor, values.avatarKey, values.onboardingCompleted === undefined ? null : values.onboardingCompleted ? 1 : 0, new Date().toISOString(), userId).run();
  return Boolean(result.meta.changes);
}

export async function markD1DeletionPending(userId: string) {
  const db = await getD1Database();
  const now = new Date();
  const deleteAfter = new Date(now.getTime() + 30 * 86400000).toISOString();
  await db.batch([
    db.prepare(`INSERT INTO account_deletion_requests (user_id, requested_at, delete_after, status) VALUES (?, ?, ?, 'pending')
      ON CONFLICT(user_id) DO UPDATE SET requested_at = excluded.requested_at, delete_after = excluded.delete_after, status = 'pending', cancelled_at = NULL, completed_at = NULL, last_error = NULL`).bind(userId, now.toISOString(), deleteAfter),
    db.prepare("UPDATE profiles SET account_status = 'deletion_pending', updated_at = ? WHERE user_id = ?").bind(now.toISOString(), userId),
  ]);
}

export async function replaceD1Avatar(userId: string, currentKey: string | null, newKey: string | null) {
  if (currentKey && currentKey !== newKey) await deleteR2Images([currentKey]);
}
