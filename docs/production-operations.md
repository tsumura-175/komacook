# こまクック 公開・運用手順

## 公開前設定

- Vercelへ`.env.example`の各値を登録する。`SUPABASE_SECRET_KEY`、`CRON_SECRET`、`CONTACT_RATE_LIMIT_SECRET`、SMTP認証情報はサーバー限定とする。
- Supabase AuthでSite URL、Redirect URL、Google Provider、Manual Identity Linkingを本番ドメインに合わせる。
- `NEXT_PUBLIC_SITE_URL`はHTTPSの本番URLとし、OGP、canonical、メールリンクの基準URLを一致させる。
- Vercel CronまたはSupabase Cronの一方だけで日次メンテナンスを実行する。

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
- Vercel: 5xx率、Function失敗、デプロイ失敗を確認する。
- Supabase: DB容量、Storage容量、接続数を70%・85%・100%で確認する。
- 管理画面: 未処理通報と管理対応を毎日確認する。
- `contact_logs`: 問い合わせメールの送信失敗を確認する。
- 日次Cron: レスポンスの`recipesFailed`、`failed`が0であることを確認する。

## バックアップ・復旧

- 無料プランではDBダンプとStorage画像を運営者側でも保管する。
- バックアップは暗号化し、本番と異なる保存先へコピーする。
- ローカル復元試験は`npm run backup:local`と`npm run restore:local -- <directory> --confirm-reset`で行う。
- 復元後はAuth、公開／非公開RLS、画像表示、問い合わせ、削除処理を再検証する。

## 障害対応

- DB障害: `/api/health`が503となる。更新操作を止め、復旧まで障害画面を案内する。
- Storage障害: レシピ本文は継続表示し、画像なし表示へ縮退する。
- メール障害: 公開閲覧は継続し、登録確認・再設定・問い合わせには再試行案内を表示する。
- Cron失敗: 同じ処理は多重実行を考慮済み。原因解消後に`npm run maintenance:run`相当を一度実行する。
