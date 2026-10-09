# D1/R2 本番切替手順

この手順は、Supabase Auth を継続し、アプリケーションデータを Cloudflare D1、画像を R2 へ切り替えるためのものです。

## 前提

- 本番 Worker `komacook` が最新の `main` をデプロイ済みであること。
- D1 は `komacook-production`、R2 は `komacook-images-production` を使用すること。
- 既存レシピ・既存画像を移行しない方針であること。Supabase Auth のユーザーは削除しない。
- `wrangler.jsonc` の `APP_DATA_BACKEND` を変更する前に、D1とR2の確認を終えること。

## 1. D1スキーマとマスタを準備する

```powershell
npm run d1:migrate:remote
npm run d1:seed:remote
```

`d1:migrate:remote` は一度だけ実行する。`d1:seed:remote` はカテゴリのマスタを投入する。レシピのダミーデータは投入しない。

## 2. 管理者をD1へ登録する

Supabase Dashboard の **Authentication → Users** で、管理者にするユーザーの UUID をコピーする。

```powershell
npm run d1:grant-admin:remote -- <コピーしたUUID>
```

このコマンドはD1プロフィールがなければ作成し、`admin` ロールを重複なく付与する。メールアドレスを引数にしてはいけない。

## 3. 切替前確認を行う

1. `https://komacook.jp/admin/cutover-check` を開く。
2. 「有効カテゴリ」「管理者権限」「管理者の初回設定」「R2画像参照」がすべて **確認済み** であることを確認する。
3. 「期限切れ一時画像」が要確認なら、Cloudflare Cron の保守Workerを一度実行してから再確認する。

画像を移行しない方針では、R2画像参照数が0件でも正常である。

## 4. 切替する

`wrangler.jsonc` の Variable として次を設定し、`main` をデプロイする。

```text
APP_DATA_BACKEND = d1
```

`keep_vars: true` はダッシュボードで登録した他のVariableをコードの再デプロイ時にも保持するための設定である。切替後は最新のデプロイのバインディングに `APP_DATA_BACKEND` が含まれることを確認する。

## 5. 公開直後の確認

- 匿名状態でトップ、検索、カテゴリ、お知らせを確認する。
- Googleログインとメールログインを確認する。
- 管理者で `/admin/cutover-check`、お知らせ、カテゴリ管理を確認する。
- レシピ作成、画像追加、画像差し替え、削除、復元を確認する。
- お問い合わせ、通報、通知メールを確認する。
- Worker の Observability で例外がないことを確認する。

## ロールバック

重大な不具合が出たら、Cloudflareの `APP_DATA_BACKEND` を `supabase` に変更して再デプロイする。その後、`wrangler.jsonc` の値も `supabase` に変更してコミットする。Supabase Auth は維持され、切替前のSupabaseデータも削除していないため、アプリデータの参照先を戻せる。

切替後に作成されたD1データはSupabaseへ自動的には戻らない。公開直後は、書き込みを伴う大規模な告知やデータ削除を行わず、基本操作を確認してから通常運用へ移る。
