import "server-only";
import { getD1Database, getImageBucket } from "./d1-bindings";

type CountRow = { count: number };

export type CutoverCheck = {
  name: string;
  status: "pass" | "warning" | "fail";
  detail: string;
};

export async function getD1CutoverChecks(adminUserId: string): Promise<CutoverCheck[]> {
  const db = await getD1Database();
  const [categories, profiles, admins, adminOnboarding, recipeImages, stepImages, staging] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM categories WHERE is_active = 1").first<CountRow>(),
    db.prepare("SELECT COUNT(*) AS count FROM profiles").first<CountRow>(),
    db.prepare("SELECT COUNT(*) AS count FROM user_roles WHERE user_id = ? AND role = 'admin'").bind(adminUserId).first<CountRow>(),
    db.prepare("SELECT COUNT(*) AS count FROM profiles WHERE user_id = ? AND onboarding_completed = 1").bind(adminUserId).first<CountRow>(),
    db.prepare("SELECT image_key FROM recipes WHERE image_key IS NOT NULL").all<{ image_key: string }>(),
    db.prepare("SELECT image_key FROM recipe_steps WHERE image_key IS NOT NULL").all<{ image_key: string }>(),
    db.prepare("SELECT COUNT(*) AS count FROM image_uploads WHERE status = 'staged' AND expires_at <= datetime('now')").first<CountRow>(),
  ]);
  const imageKeys = [...new Set([...(recipeImages.results ?? []).map((row) => row.image_key), ...(stepImages.results ?? []).map((row) => row.image_key)])];
  const bucket = await getImageBucket();
  const imageResults = await Promise.all(imageKeys.map(async (key) => ({ key, exists: Boolean(await bucket.head(key)) })));
  const missingImages = imageResults.filter((image) => !image.exists).map((image) => image.key);
  return [
    { name: "D1接続", status: "pass", detail: "D1データベースへ接続できました。" },
    { name: "有効カテゴリ", status: Number(categories?.count ?? 0) > 0 ? "pass" : "fail", detail: `有効なカテゴリ: ${Number(categories?.count ?? 0)}件` },
    { name: "管理者権限", status: Number(admins?.count ?? 0) === 1 ? "pass" : "fail", detail: Number(admins?.count ?? 0) === 1 ? "現在ログイン中の管理者にD1ロールが設定されています。" : "現在ログイン中の管理者にD1のadminロールがありません。" },
    { name: "管理者の初回設定", status: Number(adminOnboarding?.count ?? 0) === 1 ? "pass" : "fail", detail: Number(adminOnboarding?.count ?? 0) === 1 ? "管理者の初回設定が完了しています。" : "管理者のD1プロフィールで初回設定が未完了です。" },
    { name: "プロフィール", status: Number(profiles?.count ?? 0) > 0 ? "pass" : "warning", detail: `D1プロフィール: ${Number(profiles?.count ?? 0)}件。初回ログイン時に自動作成されます。` },
    { name: "R2画像参照", status: missingImages.length ? "fail" : "pass", detail: missingImages.length ? `R2に存在しない参照が${missingImages.length}件あります。` : `参照画像${imageKeys.length}件はすべてR2に存在します。` },
    { name: "期限切れ一時画像", status: Number(staging?.count ?? 0) ? "warning" : "pass", detail: Number(staging?.count ?? 0) ? `期限切れの一時画像が${Number(staging?.count ?? 0)}件あります。Cron実行後に再確認してください。` : "期限切れの一時画像はありません。" },
  ];
}
