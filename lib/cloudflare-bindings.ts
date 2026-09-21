/**
 * Cloudflare Workers の実行時バインディングを取得する。
 * 動的 import にすることで、従来の Next.js ローカル開発ではこのモジュールを呼ばない限り
 * Workers 固有のランタイムを要求しない。
 */
export async function getCloudflareBindings() {
  const worker = await import("cloudflare:workers");
  return worker.env;
}
