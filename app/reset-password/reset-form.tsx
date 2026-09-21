"use client";

import { useActionState } from "react";
import { PasswordField } from "../login/password-field";
import { updatePassword, type ResetState } from "./actions";

export function ResetForm() {
  const [state, action, pending] = useActionState(updatePassword, {} as ResetState);
  return <form className="auth-form" action={action}><PasswordField id="new-password" label="新しいパスワード" /><PasswordField id="new-password-confirmation" label="新しいパスワード（確認）" confirmation />{state.error ? <p className="auth-error" role="alert">{state.error}</p> : null}<button className="primary-action full-action" disabled={pending}>{pending ? "変更中…" : "パスワードを変更する"}</button></form>;
}

