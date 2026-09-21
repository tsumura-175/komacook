# こまクック 回帰テスト

## 方針

認証・RLS・画像処理・削除処理は、機能変更前後に必ず回帰テストを実行します。テストは`NEXT_PUBLIC_SUPABASE_URL`が`localhost`または`127.0.0.1`でない場合に停止し、本番・PreviewのDBを変更しません。

## 前提

```powershell
npm run supabase:start
```

`.env.local`には通常のローカル開発用Supabase設定が必要です。テスト会員は省略時に`docs/test-data.md`の一般会員を使います。別の会員を使用する場合だけ次を設定します。

```text
TEST_USER_EMAIL=user@komacook.local
TEST_USER_PASSWORD=Komacook!User2026
```

## 実行コマンド

```powershell
# 変更前後に実行する標準セット
npm run test:all

# 個別実行
npm run test:unit
npm run test:db
npm run test:integration
npm run test:e2e

# ウォッチとカバレッジ
npm run test:watch
npm run test:coverage
```

E2Eテストは、メール登録・確認・パスワード再設定、プロフィール画像、レシピと完成画像のライフサイクル、自動保存競合、保存・コピー・通報、管理者対応、お知らせ、退会削除、問い合わせ制限、アクセス権限を実ブラウザーで確認します。テストごとに一時会員と一意なデータを作成し、終了後にAuth・DB・Storageから削除します。

Google OAuthの外部認証画面はローカルで完結しないため、ローカルでは連携開始の失敗表示と、テスト用Google identityに対する再認証付き解除を確認します。実際のGoogle同意画面からコールバックまでの確認は、Google OAuthを設定したPreview環境で行います。

`test:all`はpgTAPによるRLSテストの後、画像処理・レシピ入力補助の単体テストとAuth・レシピ保存・削除処理の統合テストをカバレッジ計測付きで実行します。`test:e2e`はPlaywrightで公開検索・詳細・共有、メールログイン、スマートフォン表示を確認します。統合テストはUUID付きの専用データだけを作り、`afterEach`で後始末します。DBテストはトランザクション内で実行され、最後にロールバックされます。

## 現在の回帰範囲

- Auth: 正常ログイン、本人取得、誤パスワード拒否
- RLS・検索DB: 公開／非公開の閲覧、他人の更新拒否、ゴミ箱以外の直接削除拒否、定期削除関数の実行権限、キーワード・材料検索、未ログイン時の保存済み絞り込み
- 画像: 形式・容量・切り抜き値検証、1200×750 WebP変換、Orientation反映、メタデータ除去
- レシピ入力: 未完成下書き、分数量、材料グループ、自由単位、並べ替え、`lock_version`競合拒否
- アカウント設定: 家族構成の任意入力・公開条件、確認入力の完全一致、メール・Googleの最終ログイン方法保護
- 削除: 下書きのゴミ箱移動と復元、レシピとStorage画像の完全削除、Auth会員とプロフィールの退会削除
- 問い合わせ: 識別子の不可逆化、10分・24時間単位の永続送信制限
- E2E: 公開検索、詳細・共有、メールログイン、スマートフォン用ナビゲーション

## CI

`.github/workflows/test.yml`はローカルSupabaseを起動し、`test:all`、ESLint、TypeScript、本番ビルドを実行します。失敗した状態ではデプロイへ進めません。

## テスト追加ルール

- 不具合修正では、先に再現テストを追加して失敗を確認してから修正する。
- RLS変更では許可ケースと拒否ケースを同時に追加する。
- 外部状態を使うテストでは固定データを上書きせず、UUIDで分離する。
- テスト終了後にDB行、Storage画像、Auth会員が残らないことを確認する。
