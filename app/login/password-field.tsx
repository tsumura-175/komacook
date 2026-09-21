"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash, faLock } from "@fortawesome/free-solid-svg-icons";
import { useEffect, useRef, useState } from "react";
import { evaluatePasswordStrength, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, type PasswordStrength } from "../../lib/password-policy";

export function PasswordField({ id, label, name, relatedValue = "", confirmation = false }: { id: string; label: string; name?: string; relatedValue?: string; confirmation?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const [strength, setStrength] = useState<PasswordStrength | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!value || confirmation) { inputRef.current?.setCustomValidity(""); return; }
    inputRef.current?.setCustomValidity("確認中です。");
    let active = true;
    const timer = window.setTimeout(async () => {
      const result = await evaluatePasswordStrength(value, [relatedValue.split("@")[0]]);
      if (!active) return;
      setStrength(result);
      inputRef.current?.setCustomValidity(result.acceptable ? "" : result.validationMessage);
    }, 150);
    return () => { active = false; window.clearTimeout(timer); };
  }, [confirmation, relatedValue, value]);

  return <label className="auth-field" htmlFor={id}><span>{label}{!confirmation ? <small>{PASSWORD_MIN_LENGTH}文字以上</small> : null}</span><span className="auth-input-wrap"><FontAwesomeIcon icon={faLock} /><input ref={inputRef} id={id} name={name ?? (confirmation ? "password_confirmation" : "password")} type={visible ? "text" : "password"} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} value={value} onChange={(event) => setValue(event.target.value)} aria-describedby={!confirmation ? `${id}-strength` : undefined} required /><button type="button" aria-label={visible ? "パスワードを隠す" : "パスワードを表示"} onClick={() => setVisible((current) => !current)}><FontAwesomeIcon icon={visible ? faEyeSlash : faEye} /></button></span>{!confirmation ? <span className="password-strength" id={`${id}-strength`} data-level={strength?.level ?? 0}><span><i /><i /><i /><i /></span><small aria-live="polite">パスワードの強さ：{strength?.label ?? "入力してください"}</small></span> : null}</label>;
}
