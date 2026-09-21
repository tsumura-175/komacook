import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleExclamation } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { BottomNav, SiteFooter, SiteHeader } from "../components/site-shell";

export default async function AccountUnavailablePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const deletionPending = status === "deletion_pending";
  return <div className="app-shell member-page-shell"><SiteHeader /><main className="member-page-main account-unavailable-page">
    <section className="management-panel member-empty member-empty-large">
      <FontAwesomeIcon icon={faCircleExclamation} />
      <h1>{deletionPending ? "退会処理を受け付けています" : "アカウントは現在利用できません"}</h1>
      <p>{deletionPending ? "退会処理中のため、会員機能を停止しています。取り消しについては運営へお問い合わせください。" : "利用状況の確認や再開については、運営へお問い合わせください。"}</p>
      <div className="account-unavailable-actions"><Link className="primary-action" href="/contact">運営へ問い合わせる</Link><Link className="outline-action" href="/auth/signout">ログアウト</Link></div>
    </section>
  </main><SiteFooter /><BottomNav /></div>;
}
