import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell, faThumbtack } from "@fortawesome/free-solid-svg-icons";
import { createClient } from "../../lib/supabase/server";
import { saveNotice } from "../notices/actions";
import { NoticeDeleteButton } from "./notice-delete-button";

function localDate(value: string | null) { if (!value) return ""; const date = new Date(value); const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
const statuses = [["draft", "下書き"], ["scheduled", "予約公開"], ["published", "公開中"], ["hidden", "非公開"]] as const;
function editableStatus(notice: { status: string; publish_at: string | null }) { return notice.status === "published" && notice.publish_at && new Date(notice.publish_at) > new Date() ? "scheduled" : notice.status; }

export async function AdminNoticesPanel() {
  const supabase = await createClient(); const { data: notices } = await supabase.from("notices").select("id,title,body,status,audience,is_pinned,publish_at,end_at,updated_at").order("is_pinned", { ascending: false }).order("updated_at", { ascending: false });
  return <div className="admin-notices"><details className="admin-notice-editor" open><summary><FontAwesomeIcon icon={faBell} />新しいお知らせを作成</summary><form action={saveNotice.bind(null, "")} className="admin-notice-form"><NoticeFields /></form></details>
    <div className="admin-notice-list">{(notices ?? []).map((notice) => <details className="admin-notice-editor" key={notice.id}><summary><span>{notice.is_pinned ? <FontAwesomeIcon icon={faThumbtack} /> : null}{notice.title}</span><small>{statuses.find(([value]) => value === editableStatus(notice))?.[1]}・{notice.audience === "all" ? "全員" : "会員のみ"}</small></summary><form action={saveNotice.bind(null, notice.id)} className="admin-notice-form"><NoticeFields notice={notice} /></form></details>)}</div>
  </div>;
}

type Notice = { id?: string; title: string; body: string; status: string; audience: string; is_pinned: boolean; publish_at: string | null; end_at: string | null };
function NoticeFields({ notice }: { notice?: Notice }) { return <><label className="form-field admin-notice-title"><span>タイトル</span><input name="title" required maxLength={120} defaultValue={notice?.title ?? ""} /></label><label className="form-field admin-notice-body"><span>本文</span><textarea name="body" required rows={6} maxLength={10000} defaultValue={notice?.body ?? ""} /></label><div className="admin-notice-options"><label className="form-field"><span>状態</span><select name="status" defaultValue={notice ? editableStatus(notice) : "draft"}>{statuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="form-field"><span>公開範囲</span><select name="audience" defaultValue={notice?.audience ?? "all"}><option value="all">全員</option><option value="members">会員のみ</option></select></label><label className="form-field"><span>公開日時</span><input type="datetime-local" name="publish_at" defaultValue={localDate(notice?.publish_at ?? null)} /></label><label className="form-field"><span>掲載終了</span><input type="datetime-local" name="end_at" defaultValue={localDate(notice?.end_at ?? null)} /></label></div><label className="favorite-filter"><input type="checkbox" name="is_pinned" defaultChecked={notice?.is_pinned ?? false} /><span>一覧の上部に固定する</span></label><div className="admin-notice-actions"><button className="primary-action" type="submit">{notice ? "変更を保存" : "お知らせを作成"}</button>{notice?.id ? <NoticeDeleteButton noticeId={notice.id} title={notice.title} /> : null}</div></> }
