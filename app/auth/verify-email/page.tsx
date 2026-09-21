import Link from "next/link";
import { BrandMark } from "../../components/site-shell";
import { VerifyEmailPanel } from "./verify-email-panel";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const email = typeof query.email === "string" ? query.email : "";
  return <main className="auth-page"><section className="auth-card"><div className="auth-brand"><BrandMark /><span>こまクック</span></div>{email ? <VerifyEmailPanel email={email} /> : <div className="confirmation-panel"><h1>確認メールの送信先がありません</h1><p>新規登録画面から、もう一度メールアドレスを入力してください。</p><Link className="primary-action full-action" href="/login">新規登録へ戻る</Link></div>}</section></main>;
}

