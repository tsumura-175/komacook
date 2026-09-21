"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="ja"><body><main style={{ maxWidth: 640, margin: "10vh auto", padding: 24, fontFamily: "sans-serif" }}><h1>こまクックを読み込めませんでした</h1><p>一時的な問題が発生しています。しばらくしてから再度お試しください。</p><button type="button" onClick={reset}>もう一度試す</button></main></body></html>;
}

