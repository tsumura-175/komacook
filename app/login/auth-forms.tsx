"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faEye, faEyeSlash, faKey } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { signInWithPassword, signUpWithPassword, resendSignupConfirmation, type AuthState } from "./actions";
import { PasswordField } from "./password-field";

const initialState: AuthState = {};

function Status({ state }: { state: AuthState }) {
  if (state.error) return <p className="auth-error" role="alert">{state.error}</p>;
  if (state.success) return <p className="auth-success" role="status">{state.success}</p>;
  return null;
}

export function ConfirmationPanel({ email, onBack }: { email: string; onBack: () => void }) {
  const [state, action, pending] = useActionState(resendSignupConfirmation, initialState);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!seconds) return;
    const timer = window.setInterval(() => setSeconds((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [seconds]);
  return <section className="confirmation-panel"><span className="confirmation-symbol"><FontAwesomeIcon icon={faEnvelope} /></span><h2>確認メールをご確認ください</h2><p>登録を完了するためのメールを送信しました。</p><strong>{email.replace(/(^.).*(@.*$)/, "$1***$2")}</strong><ol><li>受信したメールを開く</li><li>「登録を確認する」を押す</li><li>初回設定へ進む</li></ol><form action={action} onSubmit={() => setSeconds(60)}><input type="hidden" name="email" value={email} /><Status state={state} /><button className="outline-action full-action" disabled={pending || seconds > 0}>{pending ? "再送中…" : seconds ? `${seconds}秒後に再送できます` : "確認メールを再送する"}</button></form><button className="auth-text-button" type="button" onClick={onBack}>メールアドレスを変更する</button></section>;
}

export function AuthForms({ initialMode = "login" }: { initialMode?: "login" | "signup" }) {
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [loginVisible, setLoginVisible] = useState(false);
  const [dismissed, setDismissed] = useState<string>();
  const [loginState, loginAction, loginPending] = useActionState(signInWithPassword, initialState);
  const [signupState, signupAction, signupPending] = useActionState(signUpWithPassword, initialState);
  const activeState = mode === "login" ? loginState : signupState;
  if (activeState.confirmationRequired && activeState.requestId !== dismissed) return <ConfirmationPanel email={email} onBack={() => setDismissed(activeState.requestId)} />;

  return <div className="auth-forms"><div className="auth-tabs" role="tablist" aria-label="アカウント操作"><button type="button" role="tab" aria-selected={mode === "login"} onClick={() => setMode("login")}>ログイン</button><button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => setMode("signup")}>新規登録</button></div>{mode === "login" ? <form action={loginAction} className="auth-form"><label className="auth-field" htmlFor="login-email"><span>メールアドレス</span><span className="auth-input-wrap"><FontAwesomeIcon icon={faEnvelope} /><input id="login-email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></span></label><label className="auth-field" htmlFor="login-password"><span>パスワード</span><span className="auth-input-wrap"><FontAwesomeIcon icon={faKey} /><input id="login-password" name="password" type={loginVisible ? "text" : "password"} autoComplete="current-password" minLength={8} required /><button type="button" aria-label={loginVisible ? "パスワードを隠す" : "パスワードを表示"} onClick={() => setLoginVisible((current) => !current)}><FontAwesomeIcon icon={loginVisible ? faEyeSlash : faEye} /></button></span></label><Status state={loginState} /><button className="primary-action full-action" disabled={loginPending}>{loginPending ? "ログイン中…" : "ログイン"}</button><Link className="forgot-link" href="/forgot-password"><FontAwesomeIcon icon={faKey} />パスワードを忘れた方</Link></form> : <form action={signupAction} className="auth-form"><label className="auth-field" htmlFor="signup-email"><span>メールアドレス</span><span className="auth-input-wrap"><FontAwesomeIcon icon={faEnvelope} /><input id="signup-email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></span></label><PasswordField id="signup-password" label="パスワード" relatedValue={email} /><PasswordField id="signup-password-confirmation" label="パスワード（確認）" confirmation /><Status state={signupState} /><button className="primary-action full-action" disabled={signupPending}>{signupPending ? "登録中…" : "無料で会員登録する"}</button></form>}</div>;
}
