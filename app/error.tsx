"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotateRight, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="service-error"><div><FontAwesomeIcon icon={faTriangleExclamation} /><h1>ページを読み込めませんでした</h1><p>通信またはサービスが一時的に不安定です。入力内容を確認し、時間をおいてもう一度お試しください。</p><button type="button" onClick={reset}><FontAwesomeIcon icon={faRotateRight} />もう一度試す</button><Link href="/">ホームへ戻る</Link></div></main>;
}
