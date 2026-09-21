"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { useState, useTransition } from "react";
import { Dialog } from "../components/dialog";
import { deleteNotice } from "../notices/actions";

export function NoticeDeleteButton({ noticeId, title }: { noticeId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  function openDialog() { setError(""); setOpen(true); }
  function closeDialog() { if (!pending) setOpen(false); }
  function remove() {
    setError("");
    startTransition(async () => {
      try {
        const result = await deleteNotice(noticeId);
        if (result.ok) { setOpen(false); return; }
        setError("お知らせを削除できませんでした。時間をおいてもう一度お試しください。");
      } catch {
        setError("お知らせを削除できませんでした。時間をおいてもう一度お試しください。");
      }
    });
  }
  return <><button className="danger-action" type="button" onClick={openDialog}><FontAwesomeIcon icon={faTrashCan} />削除</button>
    <Dialog open={open} titleId={`delete-notice-${noticeId}`} pending={pending} onClose={closeDialog}>
      <h2 id={`delete-notice-${noticeId}`}>お知らせを削除しますか？</h2>
      <p>「{title}」を完全に削除します。既読情報も削除され、この操作は取り消せません。</p>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <div className="report-actions"><button className="outline-action" type="button" disabled={pending} onClick={closeDialog}>キャンセル</button><button className="danger-action" type="button" disabled={pending} onClick={remove}>{pending ? "削除中…" : "削除する"}</button></div>
    </Dialog>
  </>;
}
