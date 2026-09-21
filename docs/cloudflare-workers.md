# Cloudflare Workers 配置手順

こまクックはCloudflare Workers上でNext.js 16を動かすために`vinext`を使用する。通常のローカル開発は従来どおり`npm run dev`、Workers互換の確認は`npm run build:vinext`を使う。

## 用意済みのバインディング

`wrangler.jsonc`には次を設定済み。

| バインディング | リソース |
| --- | --- |
| `DB` | D1 `komacook-production` (`9bdf8b58-5326-48ab-9054-472ae2ae35f1`) |
| `IMAGES` | R2 `komacook-images-production` |

Workers側のServer Component、Route Handler、Server Actionからは`cloudflare:workers`の`env.DB`と`env.IMAGES`を利用する。クライアントへバインディングやR2の資格情報を渡してはならない。

## Cloudflareダッシュボード

Workers & Pagesの対象Workerで、次のように設定する。

| 項目 | 値 |
| --- | --- |
| Build command | 空欄 |
| Deploy command | `npm run deploy` |
| Node.js | `.nvmrc`により22.23.2 |
| Root directory | リポジトリ直下 |

以前の`npx wrangler deploy`は使わない。`npm run deploy`はvinextのWorkersビルドと配置を一貫して実行する。

## 環境変数とシークレット

CloudflareダッシュボードのSettings → Variables and Secretsに、ProductionとPreviewを分けて設定する。

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`（Secret）
- `CRON_SECRET`（Secret）
- `CONTACT_RATE_LIMIT_SECRET`（Secret）
- メール送信を外部サービスへ移すまでに必要なメール関連のSecret

`NEXT_PUBLIC_`以外、Supabaseの管理キー、Cloudflare API TokenはGitに置かない。

## 画像処理

Workers Freeではネイティブ`sharp`を実行できない。完成写真・工程写真・アバターはブラウザCanvasで指定寸法のWebPに変換し、サーバー側はWebPコンテナ、寸法、メタデータチャンクを再検証する。R2移行後も、R2への書込みは必ず認証済みのServer ActionまたはRoute Handler経由にする。

## 現時点の移行範囲

Workersの実行基盤とD1/R2バインディングは設定済み。既存のレシピ・管理・通知データはまだSupabase PostgreSQLのRPC/RLSに依存しているため、D1スキーマとリポジトリ層への置換は別の実装単位で行う。未移行のままSupabaseのDBやStorageを停止してはならない。
