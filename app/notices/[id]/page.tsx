import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faThumbtack } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BottomNav, SiteFooter, SiteHeader } from "../../components/site-shell";
import { createClient } from "../../../lib/supabase/server";
import { NoticeReadMarker } from "../notice-read-marker";

export default async function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const supabase = await createClient();
  const [{ data: notice }, { data: authData }] = await Promise.all([supabase.from("notices").select("id,title,body,is_pinned,publish_at,audience").eq("id", id).maybeSingle(), supabase.auth.getUser()]);
  if (!notice) notFound();
  return <div className="app-shell member-page-shell"><SiteHeader /><main className="member-page-main"><NoticeReadMarker noticeId={notice.id} enabled={Boolean(authData.user)} /><Link className="auth-home-link" href="/notices"><FontAwesomeIcon icon={faArrowLeft} />お知らせ一覧へ</Link><article className="management-panel notice-detail"><div className="notice-labels">{notice.is_pinned ? <span className="notice-pin"><FontAwesomeIcon icon={faThumbtack} />固定</span> : null}<span className="notice-audience">{notice.audience === "members" ? "会員向け" : "すべての方へ"}</span></div><h1>{notice.title}</h1><time>{notice.publish_at ? new Date(notice.publish_at).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" }) : ""}</time><div className="notice-body">{String(notice.body).split(/\r?\n/).map((paragraph: string, index: number) => paragraph ? <p key={index}>{paragraph}</p> : <br key={index} />)}</div></article></main><SiteFooter /><BottomNav /></div>;
}
