import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faEnvelope } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BottomNav, SiteFooter, SiteHeader } from "../../components/site-shell";
import { createClient } from "../../../lib/supabase/server";
import { PersonalNotificationReadMarker } from "../../notices/personal-notification-read-marker";

export default async function PersonalNotificationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect(`/login?next=${encodeURIComponent(`/notifications/${id}`)}`);
  const { data: notification } = await supabase.from("user_notifications").select("id,title,body,action_href,created_at").eq("id", id).eq("user_id", authData.user.id).maybeSingle();
  if (!notification) notFound();
  return <div className="app-shell member-page-shell"><SiteHeader /><main className="member-page-main"><PersonalNotificationReadMarker notificationId={notification.id} /><Link className="auth-home-link" href="/notices"><FontAwesomeIcon icon={faArrowLeft} />お知らせ一覧へ</Link><article className="management-panel notice-detail personal-notice-detail"><div className="notice-labels"><span className="notice-audience"><FontAwesomeIcon icon={faEnvelope} />あなたへのお知らせ</span></div><h1>{notification.title}</h1><time>{new Date(notification.created_at).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}</time><div className="notice-body">{String(notification.body).split(/\r?\n/).map((paragraph: string, index: number) => paragraph ? <p key={index}>{paragraph}</p> : <br key={index} />)}</div>{notification.action_href ? <Link className="primary-action personal-notice-action" href={notification.action_href}>内容を確認する</Link> : null}</article></main><SiteFooter /><BottomNav /></div>;
}
