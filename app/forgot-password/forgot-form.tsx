"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope } from "@fortawesome/free-solid-svg-icons";
import { useActionState } from "react";
import { sendPasswordResetEmail, type ForgotState } from "./actions";

export function ForgotForm() {
  const [state, action, pending] = useActionState(sendPasswordResetEmail, {} as ForgotState);
  return <form className="auth-form" action={action}><label className="auth-field" htmlFor="reset-email"><span>登録したメールアドレス</span><span className="auth-input-wrap"><FontAwesomeIcon icon={faEnvelope} /><input id="reset-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></span></label>{state.error ? <p className="auth-error" role="alert">{state.error}</p> : null}{state.success ? <p className="auth-success" role="status">{state.success}</p> : null}<button className="primary-action full-action" disabled={pending}>{pending ? "送信中…" : "再設定メールを送る"}</button></form>;
}

