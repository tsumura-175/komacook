import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faMagnifyingGlass, faRotateLeft, faTriangleExclamation, faUserSlash } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { createClient } from "../../lib/supabase/server";
import { reactivateUser, resetProfilePresentation, restoreRecipe, suspendUser, unpublishRecipe } from "./actions";
import { getD1Database, usesD1AppData } from "../../lib/d1-bindings";

type UserRow = {
  user_id: string;
  email: string | null;
  display_name: string;
  account_status: "active" | "suspended" | "deletion_pending";
  created_at: string;
  recipe_count: number;
  public_recipe_count: number;
  is_admin: boolean;
};

type RecipeRow = {
  id: string;
  title: string;
  owner_user_id: string | null;
  visibility: "public" | "private";
  status: string;
  published_at: string | null;
  updated_at: string;
  moderated_at: string | null;
  moderation_reason: string | null;
};

const statusLabels = { active: "利用中", suspended: "利用停止", deletion_pending: "退会処理中" };
const resultMessages: Record<string, string> = {
  suspended: "会員の利用を停止しました。",
  reactivated: "会員の利用を再開しました。",
  "profile-reset": "表示名とアイコンを初期状態へ戻しました。",
  unpublished: "レシピを公開停止にしました。",
  restored: "レシピを再公開しました。",
  invalid: "理由を入力して、もう一度お試しください。",
  self: "管理者自身にはこの操作を行えません。",
  unavailable: "現在の状態ではこの操作を行えません。",
  error: "操作を完了できませんでした。もう一度お試しください。",
  "category-created": "カテゴリを追加しました。",
  "category-updated": "カテゴリを更新しました。",
  "category-activated": "カテゴリを有効にしました。",
  "category-deactivated": "カテゴリを無効にしました。",
  "tag-updated": "タグ名を更新しました。",
  "tag-activated": "タグを有効にしました。",
  "tag-deactivated": "タグを無効にしました。",
  "category-in-use": "使用中のカテゴリは無効にできません。先にレシピのカテゴリを変更してください。",
  "category-required": "「その他」は必須カテゴリのため無効にできません。",
  "taxonomy-invalid": "入力内容を確認してください。",
  "taxonomy-duplicate": "同じ名前がすでに登録されています。",
  "taxonomy-unavailable": "対象が見つかりませんでした。",
  "taxonomy-error": "分類を更新できませんでした。もう一度お試しください。",
};

export function ResultMessage({ result }: { result?: string }) {
  if (!result || !resultMessages[result]) return null;
  const isError = ["invalid", "self", "unavailable", "error", "category-in-use", "category-required", "taxonomy-invalid", "taxonomy-duplicate", "taxonomy-unavailable", "taxonomy-error"].includes(result);
  return <p className={`admin-result ${isError ? "is-error" : ""}`} role="status"><FontAwesomeIcon icon={isError ? faTriangleExclamation : faCircleCheck} />{resultMessages[result]}</p>;
}

export async function AdminUsersPanel({ query, status, result, currentUserId }: { query: string; status: string; result?: string; currentUserId: string }) {
  const supabase = await createClient();
  const validStatus = ["active", "suspended", "deletion_pending"].includes(status) ? status : null;
  const d1 = usesD1AppData() ? await getD1Database() : null;
  const d1Rows = d1 ? await d1.prepare(`SELECT profile.user_id, profile.display_name, profile.account_status, profile.created_at,
      (SELECT COUNT(*) FROM recipes WHERE owner_user_id = profile.user_id) AS recipe_count,
      (SELECT COUNT(*) FROM recipes WHERE owner_user_id = profile.user_id AND visibility = 'public' AND status = 'published' AND deleted_at IS NULL) AS public_recipe_count,
      EXISTS(SELECT 1 FROM user_roles WHERE user_id = profile.user_id AND role = 'admin') AS is_admin
      FROM profiles AS profile WHERE (? = '' OR lower(profile.display_name) LIKE ?) AND (? IS NULL OR profile.account_status = ?) ORDER BY profile.created_at DESC`)
    .bind(query, `%${query.toLocaleLowerCase("ja")}%`, validStatus, validStatus).all<Omit<UserRow, "email">>() : null;
  const { data, error } = d1 ? { data: null, error: null } : await supabase.rpc("admin_list_users", { search_text: query, status_filter: validStatus });
  const users = d1 ? (d1Rows?.results ?? []).map((user) => ({ ...user, email: null })) as UserRow[] : (data ?? []) as UserRow[];

  return <div className="admin-workspace">
    <ResultMessage result={result} />
    <form className="admin-filter" method="get">
      <label><span>会員を検索</span><div><FontAwesomeIcon icon={faMagnifyingGlass} /><input name="q" defaultValue={query} placeholder="表示名・メールアドレス" /></div></label>
      <label><span>利用状態</span><select name="status" defaultValue={status}><option value="">すべて</option><option value="active">利用中</option><option value="suspended">利用停止</option><option value="deletion_pending">退会処理中</option></select></label>
      <button className="outline-action" type="submit">絞り込む</button>
    </form>
    {error ? <div className="member-empty"><h3>会員情報を取得できませんでした</h3><p>Supabaseのmigration適用状況を確認してください。</p></div> : users.length ? <div className="admin-entity-list">{users.map((user) => {
      const canModerate = !user.is_admin && user.user_id !== currentUserId && user.account_status !== "deletion_pending";
      return <article className="admin-entity-card" key={user.user_id}>
        <div className="admin-entity-head"><div><div className="admin-entity-title"><Link href={`/users/${user.user_id}`}>{user.display_name}</Link>{user.is_admin ? <span className="status-badge">管理者</span> : null}<span className={`status-badge account-${user.account_status}`}>{statusLabels[user.account_status]}</span></div><p>{user.email ?? "メールアドレス未登録"}</p></div><time>{new Date(user.created_at).toLocaleDateString("ja-JP")} 登録</time></div>
        <dl className="admin-facts"><div><dt>レシピ</dt><dd>{user.recipe_count}件</dd></div><div><dt>公開中</dt><dd>{user.public_recipe_count}件</dd></div><div><dt>会員ID</dt><dd>{user.user_id}</dd></div></dl>
        {canModerate ? <div className="admin-actions-grid">
          <form action={(user.account_status === "suspended" ? reactivateUser : suspendUser).bind(null, user.user_id)} className="admin-inline-action"><label><span>操作理由</span><input name="reason" maxLength={1000} required placeholder={user.account_status === "suspended" ? "利用を再開する理由" : "利用を停止する理由"} /></label><button className={user.account_status === "suspended" ? "outline-action" : "danger-action"} type="submit"><FontAwesomeIcon icon={user.account_status === "suspended" ? faRotateLeft : faUserSlash} />{user.account_status === "suspended" ? "利用を再開" : "利用を停止"}</button></form>
          <form action={resetProfilePresentation.bind(null, user.user_id)} className="admin-inline-action"><label><span>プロフィール初期化の理由</span><input name="reason" maxLength={1000} required placeholder="不適切な表示名・画像など" /></label><button className="outline-action" type="submit">表示名・アイコンを初期化</button></form>
        </div> : null}
      </article>;
    })}</div> : <div className="member-empty"><h3>該当する会員はいません</h3><p>検索語や利用状態を変更してください。</p></div>}
  </div>;
}

export async function AdminRecipesPanel({ query, state, result }: { query: string; state: string; result?: string }) {
  const supabase = await createClient();
  if (usesD1AppData()) {
    const db = await getD1Database();
    const where = ["recipe.status = 'published'", "(? = '' OR lower(recipe.title) LIKE ?)"];
    const params: Array<string> = [query, `%${query.toLocaleLowerCase("ja")}%`];
    if (state === "public") where.push("recipe.visibility = 'public' AND recipe.moderated_at IS NULL");
    else if (state === "moderated") where.push("recipe.moderated_at IS NOT NULL");
    else where.push("(recipe.visibility = 'public' OR recipe.moderated_at IS NOT NULL)");
    const rows = await db.prepare(`SELECT recipe.id, recipe.title, recipe.owner_user_id, recipe.visibility, recipe.status, recipe.published_at, recipe.updated_at, recipe.moderated_at, recipe.moderation_reason, profile.display_name AS owner_name FROM recipes AS recipe LEFT JOIN profiles AS profile ON profile.user_id = recipe.owner_user_id WHERE ${where.join(" AND ")} ORDER BY recipe.updated_at DESC`).bind(...params).all<RecipeRow & { owner_name: string | null }>();
    return <RecipesContent query={query} state={state} result={result} recipes={rows.results ?? []} ownerNames={new Map((rows.results ?? []).flatMap((row) => row.owner_user_id ? [[row.owner_user_id, row.owner_name ?? "退会済みユーザー"] as const] : []))} error={false} />;
  }
  let request = supabase.from("recipes").select("id,title,owner_user_id,visibility,status,published_at,updated_at,moderated_at,moderation_reason").eq("status", "published").order("updated_at", { ascending: false });
  if (query) request = request.ilike("title", `%${query}%`);
  if (state === "public") request = request.eq("visibility", "public").is("moderated_at", null);
  else if (state === "moderated") request = request.not("moderated_at", "is", null);
  else request = request.or("visibility.eq.public,moderated_at.not.is.null");
  const { data, error } = await request;
  const recipes = (data ?? []) as RecipeRow[];
  const ownerIds = [...new Set(recipes.flatMap((recipe) => recipe.owner_user_id ? [recipe.owner_user_id] : []))];
  const { data: owners } = ownerIds.length ? await supabase.from("profiles").select("user_id,display_name").in("user_id", ownerIds) : { data: [] };
  const ownerNames = new Map((owners ?? []).map((owner) => [owner.user_id, owner.display_name]));

  return <RecipesContent query={query} state={state} result={result} recipes={recipes} ownerNames={ownerNames} error={Boolean(error)} />;
}

function RecipesContent({ query, state, result, recipes, ownerNames, error }: { query: string; state: string; result?: string; recipes: RecipeRow[]; ownerNames: Map<string, string>; error: boolean }) {
  return <div className="admin-workspace">
    <ResultMessage result={result} />
    <form className="admin-filter" method="get">
      <label><span>レシピを検索</span><div><FontAwesomeIcon icon={faMagnifyingGlass} /><input name="q" defaultValue={query} placeholder="レシピ名" /></div></label>
      <label><span>公開状態</span><select name="state" defaultValue={state}><option value="">すべて</option><option value="public">公開中</option><option value="moderated">公開停止</option></select></label>
      <button className="outline-action" type="submit">絞り込む</button>
    </form>
    {error ? <div className="member-empty"><h3>レシピを取得できませんでした</h3></div> : recipes.length ? <div className="admin-entity-list">{recipes.map((recipe) => {
      const isModerated = Boolean(recipe.moderated_at);
      return <article className="admin-entity-card" key={recipe.id}>
        <div className="admin-entity-head"><div><div className="admin-entity-title"><Link href={`/recipes/${recipe.id}`}>{recipe.title}</Link><span className={`status-badge ${isModerated ? "status-open" : ""}`}>{isModerated ? "公開停止" : "公開中"}</span></div><p>投稿者：{recipe.owner_user_id ? ownerNames.get(recipe.owner_user_id) ?? "退会済みユーザー" : "退会済みユーザー"}</p></div><time>{new Date(recipe.updated_at).toLocaleDateString("ja-JP")} 更新</time></div>
        {isModerated && recipe.moderation_reason ? <p className="admin-moderation-reason"><strong>公開停止理由</strong>{recipe.moderation_reason}</p> : null}
        <form action={(isModerated ? restoreRecipe : unpublishRecipe).bind(null, recipe.id)} className="admin-inline-action admin-recipe-action"><label><span>{isModerated ? "再公開する理由" : "公開停止する理由"}</span><input name="reason" maxLength={1000} required placeholder={isModerated ? "内容を確認し、問題が解消したため" : "通報内容と確認結果を記録"} /></label><button className={isModerated ? "outline-action" : "danger-action"} type="submit"><FontAwesomeIcon icon={isModerated ? faRotateLeft : faTriangleExclamation} />{isModerated ? "再公開する" : "公開を停止"}</button></form>
      </article>;
    })}</div> : <div className="member-empty"><h3>該当するレシピはありません</h3><p>検索語や公開状態を変更してください。</p></div>}
  </div>;
}

export async function AdminAuditPanel() {
  const supabase = await createClient();
  const d1 = usesD1AppData() ? await getD1Database() : null;
  const { data } = d1 ? { data: null } : await supabase.from("admin_actions").select("id,admin_user_id,action_type,target_type,target_id,reason,created_at").order("created_at", { ascending: false }).limit(100);
  const actions = d1 ? (await d1.prepare("SELECT id, admin_user_id, action_type, target_type, target_id, reason, created_at FROM admin_actions ORDER BY created_at DESC LIMIT 100").all()).results ?? [] : data ?? [];
  const adminIds = [...new Set(actions.map((action) => action.admin_user_id))];
  const { data: admins } = d1 || !adminIds.length ? { data: [] } : await supabase.from("profiles").select("user_id,display_name").in("user_id", adminIds);
  const d1Admins = d1 && adminIds.length ? (await d1.prepare(`SELECT user_id, display_name FROM profiles WHERE user_id IN (${adminIds.map(() => "?").join(", ")})`).bind(...adminIds).all<{ user_id: string; display_name: string }>()).results ?? [] : [];
  const adminNames = new Map([...(admins ?? []), ...d1Admins].map((admin) => [admin.user_id, admin.display_name]));
  const actionLabels: Record<string, string> = { user_suspended: "会員を利用停止", user_reactivated: "会員の利用を再開", profile_presentation_reset: "プロフィールを初期化", recipe_unpublished: "レシピを公開停止", recipe_restored: "レシピを再公開", report_status_updated: "通報状態を更新", notice_created: "お知らせを作成", notice_updated: "お知らせを更新", notice_deleted: "お知らせを削除", category_created: "カテゴリを追加", category_updated: "カテゴリを更新", category_activated: "カテゴリを有効化", category_deactivated: "カテゴリを無効化", tag_updated: "タグ名を更新", tag_activated: "タグを有効化", tag_deactivated: "タグを無効化" };
  return <div className="admin-workspace">{actions.length ? <ol className="admin-audit-list">{actions.map((action) => <li key={action.id}><div><strong>{actionLabels[action.action_type] ?? action.action_type}</strong><span>{adminNames.get(action.admin_user_id) ?? "管理者"}</span></div><p>{action.reason}</p><small>{new Date(action.created_at).toLocaleString("ja-JP")} ・ {action.target_type}：{action.target_id ?? "-"}</small></li>)}</ol> : <div className="member-empty"><h3>監査ログはありません</h3></div>}</div>;
}
