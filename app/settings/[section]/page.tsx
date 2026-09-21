import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGoogle } from "@fortawesome/free-brands-svg-icons";
import { faCheck, faEnvelope, faKey, faLink, faRightFromBracket, faShieldHalved, faTrashCan, faUser } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GOOGLE_UNLINK_CONFIRMATION } from "../../../lib/account-settings";
import { createClient } from "../../../lib/supabase/server";
import { BottomNav, SiteFooter, SiteHeader } from "../../components/site-shell";
import { PasswordField } from "../../login/password-field";
import { linkGoogle, requestAccountDeletion, signOutAll, unlinkGoogle, updateEmail, updatePassword } from "../actions";
import { ProfileEditor } from "../profile-editor";

const sections = [
  { id: "profile", label: "プロフィール", icon: faUser },
  { id: "account", label: "アカウント", icon: faShieldHalved },
  { id: "connections", label: "ログイン連携", icon: faLink },
  { id: "withdraw", label: "退会", icon: faTrashCan },
];

const messages: Record<string, string> = {
  saved: "変更を保存しました。",
  "email-sent": "新しいメールアドレスへ確認メールを送りました。確認完了までは現在のアドレスが有効です。",
  "password-saved": "パスワードを変更しました。",
  requested: "退会申請を受け付けました。",
  "google-linked": "Googleアカウントを連携しました。",
  "google-already-linked": "Googleアカウントはすでに連携済みです。",
  "google-unlinked": "Google連携を解除しました。",
};

const errors: Record<string, string> = {
  profile: "プロフィールの入力内容を確認してください。",
  avatar: "プロフィール画像を保存できませんでした。画像形式とサイズを確認してください。",
  family: "公開する家族構成を入力し、人数は0〜20人で指定してください。",
  email: "メールアドレスを変更できませんでした。時間をおいて再度お試しください。",
  "email-confirmation": "新しいメールアドレスと確認入力が一致していません。",
  "email-provider": "メール・パスワード認証が未設定のため、この操作は利用できません。",
  reauthentication: "現在のパスワードを確認できませんでした。",
  password: "パスワードを変更できませんでした。",
  "password-confirmation": "新しいパスワードと確認入力が一致していません。",
  "password-policy": "新しいパスワードが安全性の条件を満たしていません。",
  "google-link": "Google連携を開始できませんでした。連携設定またはGoogle側の状態を確認してください。",
  "google-confirmation": `確認欄に「${GOOGLE_UNLINK_CONFIRMATION}」と入力してください。`,
  "google-not-linked": "Googleアカウントは連携されていません。",
  "google-last-identity": "最後のログイン方法は解除できません。先にメール・パスワード認証を設定してください。",
  "google-unlink": "Google連携を解除できませんでした。時間をおいて再度お試しください。",
  withdraw: "退会申請を受け付けられませんでした。",
};

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ section }, query] = await Promise.all([params, searchParams]);
  if (!sections.some((item) => item.id === section)) notFound();
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect(`/login?next=/settings/${section}`);
  const { data: profile } = authData.user
    ? await supabase.from("profiles").select("display_name, standard_servings, family_adults, family_children, show_family, avatar_kind, preset_avatar_key, avatar_color, avatar_path").eq("user_id", authData.user.id).single()
    : { data: null };
  const avatarUrl = profile?.avatar_path ? (await supabase.storage.from("avatars").createSignedUrl(profile.avatar_path, 3600)).data?.signedUrl ?? null : null;
  const identities = authData.user?.identities ?? [];
  const providers = new Set(identities.map((identity) => identity.provider));
  const googleIdentity = identities.find((identity) => identity.provider === "google");
  const googleEmail = typeof googleIdentity?.identity_data?.email === "string" ? googleIdentity.identity_data.email : null;
  const hasEmailIdentity = providers.has("email");
  const hasGoogleIdentity = providers.has("google");
  const messageKey = typeof query.message === "string" ? query.message : "";
  const errorKey = typeof query.error === "string" ? query.error : "";

  return <div className="app-shell member-page-shell">
    <SiteHeader />
    <main className="member-page-main">
      <header className="member-page-heading"><div><h1>設定</h1><p>プロフィールとアカウントの安全設定を管理します。</p></div></header>
      <div className="management-layout">
        <nav className="management-panel settings-nav" aria-label="設定メニュー">{sections.map((item) => <Link key={item.id} className={section === item.id ? "is-current" : ""} href={`/settings/${item.id}`}><FontAwesomeIcon icon={item.icon} fixedWidth />{item.label}</Link>)}</nav>
        <section className={`management-panel settings-form ${section === "withdraw" ? "danger-panel" : ""}`}>
          {messageKey && messages[messageKey] ? <p className="auth-success" role="status">{messages[messageKey]}</p> : null}
          {errorKey ? <p className="auth-error" role="alert">{errors[errorKey] ?? "入力内容を確認して、もう一度お試しください。"}</p> : null}
          {section === "profile" ? <ProfileEditor profile={profile} avatarUrl={avatarUrl} /> : null}

          {section === "account" ? <div className="settings-account-list">
            <header className="settings-section-heading"><h2>アカウントとセキュリティ</h2><p>重要な変更では現在のパスワードでもう一度本人確認します。</p></header>
            {hasEmailIdentity ? <>
              <form action={updateEmail} className="settings-section settings-security-form">
                <div className="settings-section-heading"><strong><FontAwesomeIcon icon={faEnvelope} /> メールアドレス変更</strong><small>現在：{authData.user?.email}</small></div>
                <div className="settings-form-grid">
                  <label className="form-field"><span>新しいメールアドレス</span><input name="email" type="email" autoComplete="email" required /></label>
                  <label className="form-field"><span>新しいメールアドレス（確認）</span><input name="email_confirmation" type="email" autoComplete="off" required /></label>
                  <label className="form-field settings-form-wide"><span>現在のパスワード</span><input name="current_password" type="password" autoComplete="current-password" required /></label>
                </div>
                <button className="outline-action" type="submit">確認メールを送る</button>
              </form>
              <form action={updatePassword} className="settings-section settings-security-form">
                <div className="settings-section-heading"><strong><FontAwesomeIcon icon={faKey} /> パスワード変更</strong><small>現在のパスワード確認後に変更します</small></div>
                <label className="form-field"><span>現在のパスワード</span><input name="current_password" type="password" autoComplete="current-password" required /></label>
                <div className="settings-password-grid">
                  <PasswordField id="settings-new-password" name="new_password" label="新しいパスワード" relatedValue={authData.user?.email ?? ""} />
                  <PasswordField id="settings-new-password-confirmation" name="new_password_confirmation" label="新しいパスワード（確認）" confirmation />
                </div>
                <button className="outline-action" type="submit">パスワードを変更</button>
              </form>
            </> : <p className="settings-note">このアカウントはGoogleログインのみです。メール・パスワードの変更項目はありません。</p>}
            <form action={signOutAll} className="settings-section settings-security-form">
              <div className="settings-section-heading"><strong><FontAwesomeIcon icon={faRightFromBracket} /> 全端末からログアウト</strong><small>現在の端末を含むすべてのセッションを終了します</small></div>
              <button className="outline-action" type="submit">すべての端末からログアウト</button>
            </form>
          </div> : null}

          {section === "connections" ? <div className="settings-account-list">
            <header className="settings-section-heading"><h2>ログイン方法の連携</h2><p>連携後は、どちらの方法でも同じレシピとプロフィールを利用できます。</p></header>
            <article className="connection-card">
              <span className="connection-icon"><FontAwesomeIcon icon={faEnvelope} /></span>
              <div><strong>メール・パスワード</strong><small>{hasEmailIdentity ? `連携済み（${authData.user?.email ?? "メール確認済み"}）` : "未連携"}</small></div>
              <span className={`connection-status ${hasEmailIdentity ? "is-connected" : ""}`}>{hasEmailIdentity ? <><FontAwesomeIcon icon={faCheck} />連携済み</> : "未連携"}</span>
            </article>
            <article className="connection-card connection-card-google">
              <span className="connection-icon"><FontAwesomeIcon icon={faGoogle} /></span>
              <div><strong>Google</strong><small>{hasGoogleIdentity ? `連携済み${googleEmail ? `（${googleEmail}）` : ""}` : "Googleで本人確認して連携します"}</small></div>
              <span className={`connection-status ${hasGoogleIdentity ? "is-connected" : ""}`}>{hasGoogleIdentity ? <><FontAwesomeIcon icon={faCheck} />連携済み</> : "未連携"}</span>
              {!hasGoogleIdentity ? <form action={linkGoogle} className="connection-action"><button className="outline-action" type="submit"><FontAwesomeIcon icon={faGoogle} />Googleを連携</button></form> : null}
            </article>
            {hasGoogleIdentity && hasEmailIdentity ? <form action={unlinkGoogle} className="settings-section google-unlink-form">
              <div className="settings-section-heading"><strong>Google連携を解除</strong><small>解除後はメール・パスワードでログインしてください。</small></div>
              <label className="form-field"><span>現在のパスワードで再認証</span><input name="current_password" type="password" autoComplete="current-password" required /></label>
              <label className="form-field"><span>確認のため「{GOOGLE_UNLINK_CONFIRMATION}」と入力</span><input name="confirmation" autoComplete="off" required /></label>
              <button className="danger-outline-action" type="submit">Google連携を解除</button>
            </form> : null}
          </div> : null}

          {section === "withdraw" ? <form action={requestAccountDeletion} className="settings-withdraw-form"><h2>退会申請</h2><p>公開レシピは投稿者情報を匿名化して残ります。非公開レシピ等は申請から30日以内に削除されます。</p><label className="agreement-check"><input type="checkbox" required /><span>退会後のデータの取り扱いを確認しました。</span></label><button className="primary-action" type="submit">退会を申請する</button></form> : null}
        </section>
      </div>
    </main>
    <SiteFooter /><BottomNav />
  </div>;
}
