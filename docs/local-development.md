# こまクック ローカル開発環境

## 必要なもの

- Docker Desktop（Linuxコンテナ）
- Node.js / npm

Supabase CLIはプロジェクトの開発依存関係として固定しています。グローバルインストールは不要です。

## 起動

```powershell
npm run supabase:start
npm run dev -- -p 3010
```

- アプリ: http://localhost:3010
- Supabase API: http://127.0.0.1:55321
- Supabase Studio: http://127.0.0.1:55323
- 開発用メール画面: http://127.0.0.1:55324

別プロジェクトのローカルSupabaseと同時に起動できるよう、こまクックは `55320` 番台の専用ポートを使用します。

Docker Desktop for Windowsで不要なログ収集サービスが再起動を繰り返さないよう、Supabase内蔵Analyticsはローカルでは無効にしています。サービス本体のAuth・DB・Storageには影響しません。

メール確認・パスワード再設定・お問い合わせメールは外部へ送信されず、開発用メール画面で確認できます。お問い合わせ機能はローカルSMTPポート `55325` を利用します。

## 初回設定の確認

1. `/login`の新規登録から未使用のメールアドレスで登録します。
2. Mailpit（http://127.0.0.1:55324）で確認メールを開きます。
3. 初回設定で表示名、標準人数、家族構成、プリセットアイコンまたは画像、規約同意を入力します。
4. 画像を使う場合は拡大・位置を調整し、完了後にヘッダー、マイページ、公開プロフィールへ反映されることを確認します。

レシピ完成画像は登録・編集画面で8:5の範囲と拡大率を調整します。10MBまでの原画像はブラウザから`recipe-images`バケットのユーザー専用`staging`領域へ直接アップロードされ、サーバーで再検証・変換された後に削除されます。完成画像はメタデータを除いた1200×750pxのWebPです。処理後に`staging`の原画像、差し替え後に旧画像、DB更新失敗時に新規画像が残っていないことも確認します。ブラウザ終了などで後始末できなかった一時画像は、退会削除と同じ定期APIが作成24時間後から最大500件ずつ削除します。

レシピ入力は最終変更から30秒後に自動保存します。材料追加、材料・工程の並べ替え、完成画像変更時は即時保存を試みます。新規・下書きレシピはDBへ保存し、公開済みレシピの編集中データは確認前に公開内容へ反映しないようブラウザの`localStorage`へ退避します（画像ファイルは対象外）。別タブで先に保存された場合は`lock_version`競合を表示し、古い画面からの上書きを止めます。材料単位は候補から選べるほか、候補にない文字列も直接入力できます。

認証元に確認済みメールがない利用者は、初回設定で連絡用メールを入力します。Mailpitの確認リンクを開くまでは`/onboarding`へ戻され、レシピ作成・保存等の会員更新機能はRLSでも拒否されます。MVPのログイン方法はメール・パスワードとGoogleで、LINEログインは使用しません。

アカウント設定では、メール変更とパスワード変更時に現在のパスワードで再認証します。新しいメールアドレスと新しいパスワードは確認入力との一致も検証します。Google連携はSupabase AuthのManual Identity Linkingを使用し、解除はメール・パスワード認証が残る場合だけ許可します。ローカルの`supabase/config.toml`ではManual Linkingを有効化済みです。

本番ではSupabase DashboardのAuthentication設定でGoogle ProviderとManual Identity Linkingを有効にし、Google OAuth ClientへSupabaseが表示するcallback URLを登録してください。Google Client SecretはVercelの公開環境変数へ置かず、Supabase側だけで管理します。Google Providerを設定していないローカル環境では、連携画面とエラー処理までは確認できますが、実際のGoogle認証完了には開発用OAuth Clientが必要です。

## 状態確認と停止

```powershell
npm run supabase:status
npm run supabase:stop
```

## DBの初期化

```powershell
npm run supabase:reset
```

`supabase/migrations` を順番に適用し、その後 `supabase/seed.sql` を読み込みます。ローカルデータは消えるため、開発用データに対してのみ実行します。

リセット後は、認証済みテストアカウントとレシピ等のダミーデータも自動で復元されます。ログイン情報とデータ構成は [test-data.md](./test-data.md) を参照してください。

## 回帰テスト

機能変更の前後に、ローカルSupabaseを起動した状態で次を実行します。

```powershell
npm run test:all
```

認証・RLS・画像・削除処理のテスト構成と個別コマンドは [testing.md](./testing.md) を参照してください。統合テストはローカルURL以外では停止します。

### 視覚回帰テスト

レイアウト変更前後には、Chromium・Firefox・WebKitで画像比較を実行します。Chromiumでは320px、375px、390px、768px、1024px、1280px、1440pxを確認し、FirefoxとWebKit（iPhone Safari相当）でも同じ主要状態を比較します。

初回だけ、3種類のブラウザ実行環境を取得します。

```powershell
npx playwright install chromium firefox webkit
```

```powershell
npm run test:visual
```

初回または意図したデザイン変更後だけ、レビューで確認したうえで基準画像を更新します。

```powershell
npm run test:visual:update
```

視覚テストは、データ0件、読み込み中、通信失敗、長い文字列、完成画像の有無、入力エラー、モーダル、キーボードフォーカス、200%相当の表示倍率を含みます。`tests/e2e/visual-regression.spec.ts-snapshots`配下の基準画像を理由なく更新しないでください。

## 環境変数

ローカル接続値は `.env.local` に保存します。このファイルはGit管理対象外です。本番環境ではSupabase CloudのURLとPublishable Keyへ差し替えます。

本番のお問い合わせ送信では、利用するメール事業者のSMTP情報を `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASSWORD` に設定します。運営者の受信先は `CONTACT_TO_EMAIL`、送信元は `CONTACT_FROM_EMAIL` に設定します。

問い合わせの連続送信制限でIP等を不可逆化するため、本番では十分に長いランダム値を`CONTACT_RATE_LIMIT_SECRET`へ設定します。この値を変更すると既存の制限識別子との対応が切り替わります。

## 日次メンテナンス

`.env.local`（本番はホスティング環境）へ次を設定します。`SUPABASE_SECRET_KEY` と `CRON_SECRET` はブラウザへ公開しないでください。

```text
SUPABASE_SECRET_KEY=SupabaseのSecret key
CRON_SECRET=十分に長いランダムな文字列
```

ローカルではアプリを起動した状態で、期限を迎えたレシピと退会申請、古い画像一時ファイルを手動処理できます。

```powershell
npm run maintenance:run
```

互換性のため、従来の`npm run accounts:purge`も同じ処理を実行します。

本番はSupabase DashboardのCronで、毎日3:00（日本時間）に次のHTTPリクエストを登録します。Cronの時刻はUTCのため、スケジュールは `0 18 * * *` です。

- Method: `POST`
- URL: `https://本番ドメイン/api/internal/account-deletions`
- Header: `Authorization: Bearer <CRON_SECRET>`
- Body: `{}`

処理は、ゴミ箱へ移して30日を過ぎたレシピと完成画像を完全削除します。退会処理では非公開レシピとその完成画像、プロフィール画像、Auth会員情報を削除し、公開レシピは投稿者を匿名化して残します。古い画像一時ファイルも削除します。失敗した処理は次回のCronで再試行されます。

Vercelへデプロイする場合は`vercel.json`にも同じ日次スケジュールを定義済みです。Supabase CronとVercel Cronを同時には有効化せず、どちらか一方を使用してください。

## ヘルスチェックとバックアップ

`GET /api/health`はWebとDB接続を確認し、正常時は200、DB接続不可時は503を返します。外部監視ではこのURLを使用します。

ローカルのDBデータとStorage画像をバックアップするには次を実行します。

```powershell
npm run backup:local
```

`backups/<日時>`へ`database.sql`、Storage画像、`manifest.json`を保存します。`backups`はGit管理対象外です。本番データの保管先には、暗号化と別環境へのコピーが必要です。

復元は現在のローカルDBを初期化する破壊的操作です。対象フォルダを確認してから、明示フラグ付きで実行します。

```powershell
npm run restore:local -- backups\<日時> --confirm-reset
```

復元後は`npm run test:all`と主要画面の確認を行います。詳しい公開・監視手順は[production-operations.md](./production-operations.md)を参照してください。
