import { LegalPage } from "../components/legal-page";

export default function PrivacyPage() {
  return <LegalPage title="プライバシーポリシー"><section><h2>取得する情報</h2><p>メールアドレス、表示名、任意の家族構成、プロフィール画像、レシピおよびサービス利用記録を取り扱います。</p></section><section><h2>利用目的</h2><p>本人確認、レシピ保存、問い合わせ対応、サービスの安全な運営と改善のために利用します。</p></section><section><h2>画像の取り扱い</h2><p>プロフィール画像とレシピ完成画像を登録できます。アップロード画像から位置情報等を削除して保存します。</p></section><section><h2>問い合わせ</h2><p>問い合わせ本文は運営者宛てに送信し、データベースには送信日時、種別、成否のみを記録します。</p></section></LegalPage>;
}
