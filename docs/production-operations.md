# こまクック 公開・運用手順

## 公開前設定

- Cloudflare Workersの公開Workerへ`NEXT_PUBLIC_SITE_URL`、Supabase公開値、`CONTACT_TO_EMAIL`、`REPORT_TO_EMAIL`を設定する。`SUPABASE_SECRET_KEY`、`CRON_SECRET`、`CONTACT_RATE_LIMIT_SECRET`はSecretとして設定する。
- Supabase AuthでSite URL、Redirect URL、Google Provider、Manual Identity Linkingを`https://komacook.jp`に合わせる。
- `NEXT_PUBLIC_SITE_URL`は`https://komacook.jp`とし、OGP、canonical、メールリンクの基準URLを統一する。
- D1のマイグレーションとカテゴリマスタを反映する: `npm run d1:migrate:remote`、`npm run d1:seed:remote`。
- `komacook-maintenance` WorkerのCronだけがメール送信・再送、R2掃除、退会削除を実行する。別のCronを追加しない。

## 公開判定

```powershell
npm ci
npm run test:all
npm run lint
npx tsc --noEmit
npm run build
npm run test:e2e
npx supabase db lint --local
```

Previewでは未ログイン検索、メールログイン、画像登録、下書き、公開、保存、コピー、通報、管理画面、問い合わせメールを確認します。公開開始時の初期レシピ準備は必須ではありません。

## 監視

- `GET /api/health`: 5分間隔を目安にHTTP 200を監視する。
- Cloudflare Workers: 5xx率、Worker例外、デプロイ失敗、Cron実行結果を確認する。
- D1: 容量・エラー率、R2: 容量・画像取得失敗を確認する。
- 管理画面: 未処理通報と管理対応を毎日確認する。
- D1の`contact_logs`と`mail_outbox`: 問い合わせ受付失敗、送信失敗、再送回数を確認する。
- メンテナンスWorker: 15分ごとの配信・掃除と毎日03:10 JSTの退会削除が成功していることを確認する。

## バックアップ・復旧

- 無料プランではDBダンプとStorage画像を運営者側でも保管する。
- バックアップは暗号化し、本番と異なる保存先へコピーする。
- ローカル復元試験は`npm run backup:local`と`npm run restore:local -- <directory> --confirm-reset`で行う。
- 復元後はAuth、公開／非公開RLS、画像表示、問い合わせ、削除処理を再検証する。

## 障害対応

- DB障害: `/api/health`が503となる。更新操作を止め、復旧まで障害画面を案内する。
- Storage障害: レシピ本文は継続表示し、画像なし表示へ縮退する。
- メール障害: 公開閲覧は継続し、登録確認・再設定・問い合わせには再試行案内を表示する。
- Cron失敗: 同じ処理は多重実行を考慮済み。CloudflareのCron実行ログとD1の`mail_outbox`を確認し、原因解消後に必要なメールだけ再キューする。
