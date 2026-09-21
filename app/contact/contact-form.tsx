"use client";

import { FormEvent, useActionState, useState } from "react";
import { sendContact, type ContactState } from "./actions";

const initialState: ContactState = {};

export function ContactForm() {
  const [confirmed, setConfirmed] = useState(false);
  const [inquiryType, setInquiryType] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const [state, action, pending] = useActionState(sendContact, initialState);
  function submit(event: FormEvent<HTMLFormElement>) { if (!confirmed) { event.preventDefault(); setConfirmed(true); } }
  if (state.sent) return <div className="management-panel contact-form"><div className="member-empty"><h2>送信を受け付けました</h2><p>返信が必要な場合は、入力されたメールアドレスへご連絡します。</p></div></div>;
  return <form className="management-panel contact-form" action={action} onSubmit={submit} onFocusCapture={() => { if (!startedAt) setStartedAt(Date.now()); }}>
    <label className="contact-honeypot" aria-hidden="true">Webサイト<input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" /></label><input type="hidden" name="started_at" value={startedAt} />
    <label className="form-field"><span>お名前 <b>必須</b></span><input name="name" maxLength={50} required readOnly={confirmed} /></label>
    <label className="form-field"><span>返信先メール <b>必須</b></span><input name="email" type="email" maxLength={254} required readOnly={confirmed} /></label>
    <label className="form-field"><span>種別 <b>必須</b></span><select name={confirmed ? undefined : "type"} required value={inquiryType} disabled={confirmed} onChange={(event) => setInquiryType(event.target.value)}><option value="" disabled>選択してください</option>{["サービス", "アカウント", "権利", "障害", "その他"].map((item) => <option key={item}>{item}</option>)}</select>{confirmed ? <input type="hidden" name="type" value={inquiryType} /> : null}</label>
    <label className="form-field"><span>件名 <b>必須</b></span><input name="subject" maxLength={100} required readOnly={confirmed} /></label>
    <label className="form-field"><span>本文 <b>必須</b></span><textarea name="body" rows={8} maxLength={2000} required readOnly={confirmed} /></label>
    {confirmed ? <p className="auth-success">入力内容を確認し、問題なければ送信してください。</p> : null}{state.error ? <p className="auth-error" role="alert">{state.error}</p> : null}
    <div className="report-actions">{confirmed ? <button className="outline-action" type="button" disabled={pending} onClick={() => setConfirmed(false)}>入力内容を修正</button> : null}<button className="primary-action" type="submit" disabled={pending}>{pending ? "送信中…" : confirmed ? "この内容で送信する" : "入力内容を確認"}</button></div>
  </form>;
}
