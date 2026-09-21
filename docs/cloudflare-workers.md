# Cloudflare Workers 配置手順

こまクックはCloudflare Workers上でNext.js 16を動かすために`vinext`を使用する。通常のローカル開発は従来どおり`npm run dev`、Workers互換の確認は`npm run build:vinext`を使う。

## 用意済みのバインディング

`wrangler.jsonc`には次を設定済み。

| バインディング | リソース |
| --- | --- |
| `DB` | D1 `komacook-production` (`9bdf8b58-5326-48ab-9054-472ae2ae35f1`) |
| `IMAGES` | R2 `komacook-images-production` |

Workers側のServer Component、Route Handler、Server Actionからは`cloudflare:workers`の`env.DB`と`env.IMAGES`を利用する。クライアントへバインディングやR2の資格情報を渡してはならない。

## D1スキーマとマスタデータ

`cloudflare/d1/migrations/0001_initial_schema.sql`は、Supabase Authを認証専用として残し、アプリケーションデータをD1へ置くSQLiteスキーマである。`0002_operational_queues.sql`は、メール再送キューとR2の中断アップロード掃除用の管理テーブルを追加する。いいね、コレクション、OCRのテーブルは含めない。

初期公開レシピや擬似ユーザーは投入しない。`cloudflare/d1/seed.sql`はカテゴリだけを投入するため、実運用にも安全に適用できる。

ローカルD1の作成・更新:

```powershell
npm run d1:migrate:local
npm run d1:seed:local
```

本番D1へ反映する場合は、Cloudflareへログイン済みの端末で明示的に実行する。WorkerのデプロイだけではD1マイグレーションは適用されない。

```powershell
npm run d1:migrate:remote
npm run d1:seed:remote
```

本番実行前に必ずSQL差分を確認すること。以後のマイグレーションは破壊的変更を避け、追加ファイルとして管理する。

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
- `RESEND_API_KEY`（Secret）
- `EMAIL_FROM`（例: `こまクック <noreply@komacook.jp>`）
- `CONTACT_TO_EMAIL`（`daiki.hayakawa.work@gmail.com`）
- `REPORT_TO_EMAIL`（未設定時は`CONTACT_TO_EMAIL`を使用）
- `EMAIL_DELIVERY_BACKEND=d1`（Variable。Cloudflare本番では必須）

`NEXT_PUBLIC_`以外、Supabaseの管理キー、Cloudflare API TokenはGitに置かない。

## メール再送・R2掃除Cron

`cloudflare/maintenance/wrangler.jsonc`は公開アプリと分けたメンテナンスWorkerである。15分ごとにD1の`mail_outbox`を送信・再送し、期限切れのメール本文と中断したR2アップロードを掃除する。毎日03:10 JST（18:10 UTC）にも同じ掃除を行う。

初回だけ、Cloudflareに次のSecretを設定してデプロイする。値をGitへ保存してはならない。

```powershell
npx wrangler secret put RESEND_API_KEY --config cloudflare/maintenance/wrangler.jsonc
npx wrangler secret put EMAIL_FROM --config cloudflare/maintenance/wrangler.jsonc
npx wrangler secret put CRON_SECRET --config cloudflare/maintenance/wrangler.jsonc
npx wrangler secret put SITE_URL --config cloudflare/maintenance/wrangler.jsonc
npm run maintenance:deploy
```

Cron Workerはメールキューと一時画像を対象にし、毎日03:10 JSTには既存の退会削除APIも認証付きで起動する。`SITE_URL` は `https://komacook.jp`、`CRON_SECRET` は公開アプリに設定したものと完全に同一の値にする。退会データをD1へ移すまでは、削除API自体はSupabaseを利用する。

## 画像処理

Workers Freeではネイティブ`sharp`を実行できない。完成写真・工程写真・アバターはブラウザCanvasで指定寸法のWebPに変換し、サーバー側はWebPコンテナ、寸法、メタデータチャンクを再検証する。R2移行後も、R2への書込みは必ず認証済みのServer ActionまたはRoute Handler経由にする。

## 現時点の移行範囲

Workersの実行基盤とD1/R2バインディング、D1の初期スキーマ、メール再送・一時画像掃除Workerは設定済みである。一方、既存のレシピ・管理・通知の本体はまだSupabase PostgreSQLのRPC/RLSに依存している。この段階でSupabaseのDBやStorageを停止するとアプリは壊れる。D1リポジトリ層とR2画像APIへの置換が完了するまで停止してはならない。
