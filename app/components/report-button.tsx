"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFlag, faXmark } from "@fortawesome/free-solid-svg-icons";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { submitReport } from "../reports/actions";

const reasons = [
  { value: "copyright", label: "権利侵害・無断転載" },
  { value: "dangerous", label: "危険または不正確な内容" },
  { value: "inappropriate", label: "不適切な表現" },
  { value: "spam", label: "スパム・宣伝" },
  { value: "other", label: "その他" },
] as const;

type Props = {
  targetType: "recipe" | "profile";
  targetId: string;
  label: string;
  className?: string;
  showIcon?: boolean;
};

export function ReportButton({ targetType, targetId, label, className, showIcon = false }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    function closeWithEscape(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", closeWithEscape);
    return () => document.removeEventListener("keydown", closeWithEscape);
  }, [open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const values = new FormData(event.currentTarget);
    const selectedReason = reasons.find((reason) => reason.value === values.get("reason"))?.value;
    if (!selectedReason) { setError("通報理由を選択してください。"); return; }
    startTransition(async () => {
      const result = await submitReport({
        targetType,
        targetId,
        reason: selectedReason,
        detail: String(values.get("detail") ?? ""),
      });
      if (result.ok) { setSent(true); return; }
      if (result.error === "login_required") { router.push(`/login?next=${encodeURIComponent(pathname)}`); return; }
      const messages = {
        duplicate: "この対象はすでに通報済みです。運営者の確認をお待ちください。",
        not_allowed: "この対象は通報できません。",
        invalid: "通報理由と補足内容を確認してください。",
        failed: "通報を送信できませんでした。時間をおいてお試しください。",
      } as const;
      setError(messages[result.error as keyof typeof messages] ?? messages.failed);
    });
  }

  function openDialog() { setSent(false); setError(""); setOpen(true); }

  return <>
    <button className={className} type="button" onClick={openDialog}>{showIcon ? <FontAwesomeIcon icon={faFlag} /> : null}{label}</button>
    {open ? <div className="modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <button ref={closeButtonRef} className="modal-close" type="button" aria-label="通報画面を閉じる" onClick={() => setOpen(false)}><FontAwesomeIcon icon={faXmark} /></button>
        {sent ? <div className="member-empty"><FontAwesomeIcon icon={faFlag} /><h2 id="report-title">通報を受け付けました</h2><p>投稿者へ通報者の情報は表示されません。運営者が内容を確認します。</p><button type="button" onClick={() => setOpen(false)}>閉じる</button></div> :
          <form onSubmit={handleSubmit}>
            <h2 id="report-title">{targetType === "recipe" ? "このレシピを通報" : "このプロフィールを通報"}</h2>
            <p>最も近い理由を選択してください。通報だけで自動的に非公開になることはありません。</p>
            <fieldset className="report-reasons"><legend className="sr-only">通報理由</legend>{reasons.map((reason) => <label key={reason.value}><input type="radio" name="reason" value={reason.value} required /><span>{reason.label}</span></label>)}</fieldset>
            <label className="form-field"><span>補足（任意）</span><textarea name="detail" rows={3} maxLength={500} /></label>
            {error ? <p className="auth-error" role="alert">{error}</p> : null}
            <div className="report-actions"><button className="outline-action" type="button" onClick={() => setOpen(false)}>キャンセル</button><button className="primary-action" type="submit" disabled={pending}>{pending ? "送信中…" : "通報を送信"}</button></div>
          </form>}
      </section>
    </div> : null}
  </>;
}
