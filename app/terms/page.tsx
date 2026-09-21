import { LegalPage } from "../components/legal-page";

export default function TermsPage() {
  return <LegalPage title="利用規約"><section><h2>サービスについて</h2><p>こまクックは、利用者が料理レシピを記録し、公開されたレシピを閲覧できるサービスです。</p></section><section><h2>アカウント</h2><p>登録情報は正確に管理し、第三者による不正利用を防ぐため、パスワードやログイン端末を適切に管理してください。</p></section><section><h2>投稿内容</h2><p>投稿者は、投稿する文章や画像について必要な権利を有していることを確認してください。他者レシピの自分用コピーは非公開で保存されます。</p></section><section><h2>禁止事項</h2><ul><li>第三者の権利を侵害する投稿</li><li>危険または著しく不正確な料理情報</li><li>迷惑行為、スパム、サービスの不正利用</li></ul></section><section><h2>退会</h2><p>退会後、公開レシピは投稿者情報を匿名化して残し、その他の対象データは定められた期間内に削除します。</p></section></LegalPage>;
}
