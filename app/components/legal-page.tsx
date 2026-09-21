import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { ReactNode } from "react";
import { BrandMark } from "./site-shell";

export function LegalPage({ title, updated = "2026年8月16日", children }: { title: string; updated?: string; children: ReactNode }) {
  return <main className="auth-document"><Link className="auth-home-link" href="/"><FontAwesomeIcon icon={faArrowLeft} />ホームへ戻る</Link><header><div className="auth-brand"><BrandMark /><span>こまクック</span></div><h1>{title}</h1><p>最終更新日：{updated}</p></header>{children}</main>;
}
