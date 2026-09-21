import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { BrandMark } from "../components/site-shell";
import { ForgotForm } from "./forgot-form";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return <main className="auth-page"><section className="auth-card"><Link className="auth-home-link" href="/login"><FontAwesomeIcon icon={faArrowLeft} />ログインへ戻る</Link><div className="auth-brand"><BrandMark /><span>こまクック</span></div><header className="auth-heading"><h1>パスワードを再設定</h1><p>登録したメールアドレスへ、再設定用のリンクを送ります。</p></header>{query.error === "expired" ? <p className="auth-error" role="alert">再設定リンクの有効期限が切れています。もう一度送信してください。</p> : null}<ForgotForm /></section></main>;
}

