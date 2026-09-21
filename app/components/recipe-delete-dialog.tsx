"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pending?: boolean;
  onClose(): void;
  onConfirm(): void;
};

export function RecipeDeleteDialog({ open, title, description, confirmLabel, pending = false, onClose, onConfirm }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open, pending]);

  if (!open) return null;
  return <div className="modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}>
    <div className="report-dialog recipe-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="recipe-delete-title" aria-describedby="recipe-delete-description">
      <button className="modal-close" type="button" aria-label="閉じる" disabled={pending} onClick={onClose}><FontAwesomeIcon icon={faXmark} /></button>
      <span className="recipe-delete-dialog-icon" aria-hidden="true"><FontAwesomeIcon icon={faTriangleExclamation} /></span>
      <h2 id="recipe-delete-title">{title}</h2>
      <p id="recipe-delete-description">{description}</p>
      <div className="report-actions">
        <button ref={cancelRef} className="outline-action" type="button" disabled={pending} onClick={onClose}>キャンセル</button>
        <button className="danger-action" type="button" disabled={pending} onClick={onConfirm}>{pending ? "処理中…" : confirmLabel}</button>
      </div>
    </div>
  </div>;
}

