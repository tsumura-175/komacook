"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { type ReactNode, type RefObject, useEffect, useRef } from "react";

type DialogProps = {
  open: boolean;
  titleId: string;
  descriptionId?: string;
  children: ReactNode;
  className?: string;
  role?: "dialog" | "alertdialog";
  pending?: boolean;
  onClose?: () => void;
  closeLabel?: string;
  triggerRef?: RefObject<HTMLElement | null>;
};

let scrollLockCount = 0;
let previousBodyOverflow = "";

function lockBodyScroll() {
  if (scrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  scrollLockCount += 1;
}

function unlockBodyScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) document.body.style.overflow = previousBodyOverflow;
}

function getFocusable(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")]
    .filter((element) => !element.hasAttribute("hidden") && element.getClientRects().length > 0);
}

export function Dialog({ open, titleId, descriptionId, children, className = "", role = "dialog", pending = false, onClose, closeLabel = "閉じる", triggerRef }: DialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const pendingRef = useRef(pending);

  useEffect(() => {
    onCloseRef.current = onClose;
    pendingRef.current = pending;
  }, [onClose, pending]);

  useEffect(() => {
    if (!open) return;
    const explicitReturnTarget = triggerRef?.current ?? null;
    lastFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lockBodyScroll();
    const dialog = dialogRef.current;
    const focusInitialElement = () => (getFocusable(dialog ?? document.body)[0] ?? dialog)?.focus();
    const timer = window.setTimeout(focusInitialElement, 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pendingRef.current && onCloseRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = getFocusable(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      unlockBodyScroll();
      const returnTarget = explicitReturnTarget ?? lastFocusedRef.current;
      window.setTimeout(() => { if (returnTarget?.isConnected) returnTarget.focus(); }, 0);
    };
  }, [open, triggerRef]);

  if (!open) return null;
  const canClose = Boolean(onClose) && !pending;
  return <div className="modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget && canClose) onClose?.(); }}>
    <section ref={dialogRef} className={`report-dialog ${className}`.trim()} role={role} aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}>
      {onClose ? <button className="modal-close" type="button" aria-label={closeLabel} disabled={!canClose} onClick={onClose}><FontAwesomeIcon icon={faXmark} /></button> : null}
      {children}
    </section>
  </div>;
}
