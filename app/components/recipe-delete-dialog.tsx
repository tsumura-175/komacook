"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { Dialog } from "./dialog";

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
  return <Dialog open={open} titleId="recipe-delete-title" descriptionId="recipe-delete-description" className="recipe-delete-dialog" pending={pending} onClose={onClose}>
      <span className="recipe-delete-dialog-icon" aria-hidden="true"><FontAwesomeIcon icon={faTriangleExclamation} /></span>
      <h2 id="recipe-delete-title">{title}</h2>
      <p id="recipe-delete-description">{description}</p>
      <div className="report-actions">
        <button className="outline-action" type="button" disabled={pending} onClick={onClose}>キャンセル</button>
        <button className="danger-action" type="button" disabled={pending} onClick={onConfirm}>{pending ? "処理中…" : confirmLabel}</button>
      </div>
  </Dialog>;
}
