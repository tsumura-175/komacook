import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGoogle } from "@fortawesome/free-brands-svg-icons";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { BrandMark } from "../components/site-shell";
import { AuthForms } from "./auth-forms";
import { signInWithGoogle } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const error = typeof query.error === "string" ? query.error : "";
  const message = typeof query.message === "string" ? query.message : "";
  const initialMode = query.mode === "signup" ? "signup" : "login";
  const errors: Record<string, string> = {
    setup: "Supabaseの接続設定後にGoogleログインを利用できます。",
    google: "Googleログインを開始できませんでした。設定をご確認ください。",
    callback: "認証リンクを確認できませんでした。もう一度お試しください。",
  };

  return <main className="auth-page"><section className="auth-card"><Link className="auth-home-link" href="/"><FontAwesomeIcon icon={faArrowLeft} />ホームへ戻る</Link><div className="auth-brand"><BrandMark /><span>こまクック</span></div><header className="auth-heading"><h1>いつもの味を、これからも。</h1><p>レシピを保存して、家族に合う分量ですぐに作れます。</p></header><div className="social-auth"><form action={signInWithGoogle}><button className="social-auth-button" type="submit"><FontAwesomeIcon icon={faGoogle} /><span>Googleで続ける</span></button></form></div>{errors[error] ? <p className="auth-error" role="alert">{errors[error]}</p> : null}{message === "password-updated" ? <p className="auth-success" role="status">パスワードを変更しました。新しいパスワードでログインしてください。</p> : null}<div className="auth-divider"><span>または</span></div><AuthForms initialMode={initialMode} /><p className="auth-legal">登録を続けることで、<Link href="/terms" target="_blank" rel="noopener noreferrer">利用規約</Link>と<Link href="/privacy" target="_blank" rel="noopener noreferrer">プライバシーポリシー</Link>を確認したうえで初回設定へ進みます。</p></section></main>;
}
