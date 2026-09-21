import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell, faEnvelope } from "@fortawesome/free-regular-svg-icons";
import { faBookOpen, faBookmark, faChevronRight, faGear, faLock, faPenToSquare, faShieldHalved, faUtensils } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { BottomNav, SiteFooter, SiteHeader } from "../components/site-shell";
import { ProfileAvatar } from "../components/profile-avatar";
import { getCurrentProfile } from "../../lib/recipes";

export default async function MyPage() {
  const account = await getCurrentProfile();
  const profile = account?.profile;
  return (
    <div className="app-shell member-page-shell">
      <SiteHeader />
      <main className="member-page-main mypage-main">
        <header className="member-page-heading"><div><h1>マイページ</h1><p>プロフィールと、こまクックの設定を確認できます。</p></div></header>

        <section className="profile-overview" aria-labelledby="profile-name">
          <div className="profile-main"><ProfileAvatar avatarKind={profile?.avatar_kind} presetKey={profile?.preset_avatar_key} color={profile?.avatar_color} imageUrl={account?.avatarUrl} className="profile-avatar-large" /><div><span>表示名</span><h2 id="profile-name">{profile?.display_name ?? "こまクックユーザー"}</h2><p><FontAwesomeIcon icon={faLock} />{profile?.show_family ? `大人${profile.family_adults ?? 0}人・子ども${profile.family_children ?? 0}人を公開` : "家族構成は非公開"}</p></div></div>
          <Link className="outline-action" href="/settings/profile">プロフィールを編集</Link>
        </section>

        <section className="mypage-summary mypage-summary-two" aria-label="利用状況">
          <Link href="/mypage/recipes"><span><FontAwesomeIcon icon={faBookOpen} /></span><div><strong>{account?.recipeCount ?? 0}</strong><small>自分のレシピ</small></div><FontAwesomeIcon icon={faChevronRight} /></Link>
          <Link href="/mypage/recipes?tab=favorites"><span><FontAwesomeIcon icon={faBookmark} /></span><div><strong>{account?.favoriteCount ?? 0}</strong><small>保存したレシピ</small></div><FontAwesomeIcon icon={faChevronRight} /></Link>
        </section>

        <div className="mypage-columns">
          <section className="mypage-menu-panel" aria-labelledby="recipe-menu-title">
            <h2 id="recipe-menu-title">レシピ</h2>
            <Link href="/recipes/new"><span><FontAwesomeIcon icon={faPenToSquare} /></span><div><strong>手入力で登録</strong><small>材料と手順を自分で入力</small></div><FontAwesomeIcon icon={faChevronRight} /></Link>
            <Link href="/mypage/recipes"><span><FontAwesomeIcon icon={faUtensils} /></span><div><strong>マイレシピ</strong><small>保存したレシピを整理</small></div><FontAwesomeIcon icon={faChevronRight} /></Link>
          </section>

          <section className="mypage-menu-panel" aria-labelledby="settings-menu-title">
            <h2 id="settings-menu-title">設定・サポート</h2>
            <Link href="/settings/profile"><span><FontAwesomeIcon icon={faGear} /></span><div><strong>プロフィール設定</strong><small>表示名・家族構成・アイコン</small></div><FontAwesomeIcon icon={faChevronRight} /></Link>
            <Link href="/settings/account"><span><FontAwesomeIcon icon={faShieldHalved} /></span><div><strong>アカウントとセキュリティ</strong><small>メール・パスワード・ログイン連携</small></div><FontAwesomeIcon icon={faChevronRight} /></Link>
            <Link href="/notices"><span><FontAwesomeIcon icon={faBell} /></span><div><strong>お知らせ</strong><small>運営からの重要なご案内</small></div><FontAwesomeIcon icon={faChevronRight} /></Link>
            <Link href="/contact"><span><FontAwesomeIcon icon={faEnvelope} /></span><div><strong>お問い合わせ</strong><small>困ったときはこちら</small></div><FontAwesomeIcon icon={faChevronRight} /></Link>
          </section>
        </div>
      </main>
      <SiteFooter />
      <BottomNav />
    </div>
  );
}
