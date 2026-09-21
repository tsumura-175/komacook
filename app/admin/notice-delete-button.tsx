"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrashCan, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useEffect, useState, useTransition } from "react";
import { deleteNotice } from "../notices/actions";

export function NoticeDeleteButton({ noticeId, title }: { noticeId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  useEffect(() => { if (!open) return; const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close); }, [open]);
  function remove() { startTransition(async () => { const result = await deleteNotice(noticeId); if (result.ok) setOpen(false); }); }
  return <><button className="danger-action" type="button" onClick={() => setOpen(true)}><FontAwesomeIcon icon={faTrashCan} />削除</button>{open ? <div className="modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><div className="report-dialog notice-delete-dialog" role="dialog" aria-modal="true" aria-labelledby={`delete-notice-${noticeId}`}><button className="modal-close" type="button" aria-label="閉じる" onClick={() => setOpen(false)}><FontAwesomeIcon icon={faXmark} /></button><h2 id={`delete-notice-${noticeId}`}>お知らせを削除しますか？</h2><p>「{title}」を完全に削除します。既読情報も削除され、この操作は取り消せません。</p><div className="report-actions"><button className="outline-action" type="button" disabled={pending} onClick={() => setOpen(false)}>キャンセル</button><button className="danger-action" type="button" disabled={pending} onClick={remove}>{pending ? "削除中…" : "削除する"}</button></div></div></div> : null}</>;
}
