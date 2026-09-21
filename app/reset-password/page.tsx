import { BrandMark } from "../components/site-shell";
import { ResetForm } from "./reset-form";

export default function ResetPasswordPage() {
  return <main className="auth-page"><section className="auth-card"><div className="auth-brand"><BrandMark /><span>こまクック</span></div><header className="auth-heading"><h1>新しいパスワード</h1><p>安全のため、変更後はすべての端末からログアウトします。</p></header><ResetForm /></section></main>;
}

