import { BottomNav, SiteFooter, SiteHeader } from "../components/site-shell";
import { ContactForm } from "./contact-form";

export default function ContactPage() { return <div className="app-shell member-page-shell"><SiteHeader /><main className="member-page-main"><header className="member-page-heading"><div><h1>お問い合わせ</h1><p>サービスの使い方、アカウント、権利に関するご連絡を受け付けます。</p></div></header><div className="contact-layout"><ContactForm /><aside className="management-panel support-note"><h2>送信内容について</h2><p>問い合わせ本文はメール送信後、データベースへ保存しません。送信日時、種別、成否のみ記録します。</p><p>通常は数日以内に返信します。同じ内容を繰り返し送信せず、返信をお待ちください。</p></aside></div></main><SiteFooter /><BottomNav /></div>; }
