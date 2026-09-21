import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell, faChartLine, faFlag, faList, faScroll, faTags, faUsers } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BottomNav, SiteFooter, SiteHeader } from "../../components/site-shell";
import { createClient } from "../../../lib/supabase/server";
import { updateReport } from "../actions";
import { AdminAuditPanel, AdminRecipesPanel, AdminUsersPanel } from "../moderation-panels";
import { AdminNoticesPanel } from "../notices-panel";
import { AdminTaxonomyPanel } from "../taxonomy-panel";

const menus = [{ id: "", label: "概要", icon: faChartLine }, { id: "users", label: "会員", icon: faUsers }, { id: "recipes", label: "レシピ", icon: faList }, { id: "reports", label: "通報", icon: faFlag }, { id: "notices", label: "お知らせ", icon: faBell }, { id: "categories", label: "タグ・カテゴリ", icon: faTags }, { id: "audit-logs", label: "監査ログ", icon: faScroll }];
const reasonLabels: Record<string, string> = { copyright: "権利侵害・無断転載", dangerous: "危険または不正確", inappropriate: "不適切な表現", spam: "スパム・宣伝", other: "その他" };
const statusLabels: Record<string, string> = { open: "未対応", reviewing: "確認中", resolved: "対応済み", dismissed: "対応不要" };

type ReportRow = { id: string; target_type: "recipe" | "profile"; recipe_id: string | null; profile_user_id: string | null; reason: string; detail: string | null; status: string; admin_note: string | null; created_at: string; recipes: { title: string } | { title: string }[] | null };
function relationTitle(value: ReportRow["recipes"]) { const item = Array.isArray(value) ? value[0] : value; return item?.title ?? "削除済みレシピ"; }

export default async function AdminPage({ params, searchParams }: { params: Promise<{ section?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ section: sectionParts }, filters, supabase] = await Promise.all([params, searchParams, createClient()]);
  const section = sectionParts?.[0] ?? "";
  const query = typeof filters.q === "string" ? filters.q.trim().slice(0, 100) : "";
  const status = typeof filters.status === "string" ? filters.status : "";
  const state = typeof filters.state === "string" ? filters.state : "";
  const result = typeof filters.result === "string" ? filters.result : undefined;
  const current = menus.find((item) => item.id === section);
  if (!current) notFound();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect(`/login?next=${encodeURIComponent(section ? `/admin/${section}` : "/admin")}`);
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) notFound();

  const [profiles, recipes, openReports, reportRows] = await Promise.all([
    supabase.from("profiles").select("user_id", { count: "exact", head: true }),
    supabase.from("recipes").select("id", { count: "exact", head: true }).eq("visibility", "public").eq("status", "published"),
    supabase.from("reports").select("id", { count: "exact", head: true }).in("status", ["open", "reviewing"]),
    section === "reports" ? supabase.from("reports").select("id, target_type, recipe_id, profile_user_id, reason, detail, status, admin_note, created_at, recipes(title)").order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const reports = (reportRows.data ?? []) as unknown as ReportRow[];
  const profileIds = [...new Set(reports.flatMap((report) => report.profile_user_id ? [report.profile_user_id] : []))];
  const { data: reportedProfiles } = profileIds.length ? await supabase.from("profiles").select("user_id, display_name").in("user_id", profileIds) : { data: [] };
  const profileNames = new Map((reportedProfiles ?? []).map((profile) => [profile.user_id, profile.display_name]));

  return <div className="app-shell member-page-shell"><SiteHeader /><main className="member-page-main">
    <header className="member-page-heading"><div><h1>管理画面</h1><p>個人運営に必要な確認と対応を、優先度順に管理します。</p></div><span className="status-badge">管理者</span></header>
    <div className="management-layout"><nav className="management-panel admin-nav" aria-label="管理メニュー">{menus.map((item) => <Link key={item.id} className={section === item.id ? "is-current" : ""} href={item.id ? `/admin/${item.id}` : "/admin"}><FontAwesomeIcon icon={item.icon} />{item.label}</Link>)}</nav>
      <section className="management-panel"><h2>{current.label}</h2>
        {section === "" ? <div className="mypage-summary"><Link href="/admin/users"><span><FontAwesomeIcon icon={faUsers} /></span><div><strong>{profiles.count ?? 0}</strong><small>会員数</small></div></Link><Link href="/admin/recipes"><span><FontAwesomeIcon icon={faList} /></span><div><strong>{recipes.count ?? 0}</strong><small>公開レシピ</small></div></Link><Link href="/admin/reports"><span><FontAwesomeIcon icon={faFlag} /></span><div><strong>{openReports.count ?? 0}</strong><small>要確認の通報</small></div></Link></div> : null}
        {section === "reports" ? <div className="admin-report-list">{reports.length ? reports.map((report) => {
          const targetHref = report.target_type === "recipe" ? `/recipes/${report.recipe_id}` : `/users/${report.profile_user_id}`;
          const targetName = report.target_type === "recipe" ? relationTitle(report.recipes) : profileNames.get(report.profile_user_id ?? "") ?? "削除済みプロフィール";
          return <article className="admin-report-card" key={report.id}><div className="admin-report-head"><div><span className={`status-badge status-${report.status}`}>{statusLabels[report.status] ?? report.status}</span><small>{new Date(report.created_at).toLocaleString("ja-JP")}</small></div><Link href={targetHref}>{targetName}</Link></div><dl><div><dt>対象</dt><dd>{report.target_type === "recipe" ? "レシピ" : "プロフィール"}</dd></div><div><dt>理由</dt><dd>{reasonLabels[report.reason] ?? report.reason}</dd></div></dl>{report.detail ? <p className="admin-report-detail">{report.detail}</p> : null}<form action={updateReport.bind(null, report.id)} className="admin-report-form"><label className="form-field"><span>対応状態</span><select name="status" defaultValue={report.status}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="form-field"><span>管理メモ</span><textarea name="admin_note" rows={2} maxLength={2000} defaultValue={report.admin_note ?? ""} /></label><button className="primary-action" type="submit">対応内容を保存</button></form></article>;
        }) : <div className="member-empty"><FontAwesomeIcon icon={faFlag} /><h3>通報はありません</h3><p>新しい通報が届くと、ここに表示されます。</p></div>}</div> : null}
        {section === "users" ? <AdminUsersPanel query={query} status={status} result={result} currentUserId={authData.user.id} /> : null}
        {section === "recipes" ? <AdminRecipesPanel query={query} state={state} result={result} /> : null}
        {section === "notices" ? <AdminNoticesPanel /> : null}
        {section === "audit-logs" ? <AdminAuditPanel /> : null}
        {section === "categories" ? <AdminTaxonomyPanel query={query} result={result} /> : null}
      </section></div>
  </main><SiteFooter /><BottomNav /></div>;
}
