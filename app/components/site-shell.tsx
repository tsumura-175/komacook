"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell } from "@fortawesome/free-regular-svg-icons";
import {
  faBars,
  faBookOpen,
  faHouse,
  faMagnifyingGlass,
  faPlus,
  faRightFromBracket,
  faRightToBracket,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import poodleChef from "../../public/brand/komacook-poodle-chef.png";
import { ProfileAvatar } from "./profile-avatar";

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <Image
        className="brand-mascot"
        src={poodleChef}
        alt=""
        width={56}
        height={56}
        priority
      />
    </span>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewer, setViewer] = useState<{ signedIn: boolean; displayName: string; hasUnreadNotification: boolean; avatarKind?: string; presetKey?: string | null; color?: string | null; avatarUrl?: string | null }>({ signedIn: false, displayName: "", hasUnreadNotification: false });
  const menuRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const isHome = pathname === "/";
  const isMyRecipes = pathname.startsWith("/mypage/recipes");
  const isRegistering = pathname === "/recipes/new";
  const isRecipes = pathname.startsWith("/recipes") && !isRegistering;

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    async function loadViewer() {
      const { data } = await supabase.auth.getUser();
      if (!active || !data.user) {
        if (active) setViewer({ signedIn: false, displayName: "", hasUnreadNotification: false });
        return;
      }
      const [{ data: profile }, { count: unreadCount }] = await Promise.all([
        supabase.from("profiles").select("display_name, avatar_kind, preset_avatar_key, avatar_color, avatar_path").eq("user_id", data.user.id).maybeSingle(),
        supabase.from("user_notifications").select("id", { count: "exact", head: true }).eq("user_id", data.user.id).is("read_at", null),
      ]);
      const avatarUrl = profile?.avatar_path ? (await supabase.storage.from("avatars").createSignedUrl(profile.avatar_path, 3600)).data?.signedUrl ?? null : null;
      if (active) setViewer({ signedIn: true, displayName: profile?.display_name ?? "マイページ", hasUnreadNotification: (unreadCount ?? 0) > 0, avatarKind: profile?.avatar_kind, presetKey: profile?.preset_avatar_key, color: profile?.avatar_color, avatarUrl });
    }
    void loadViewer();
    const { data: listener } = supabase.auth.onAuthStateChange(() => void loadViewer());
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    function closeFromOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !menuButtonRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    }

    function closeWithEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [menuOpen]);

  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="こまクック ホーム">
        <BrandMark />
        <span className="brand-name">こまクック</span>
      </Link>
      <nav className="desktop-nav" aria-label="メインメニュー">
        <Link className={`nav-link ${isHome ? "is-current" : ""}`} href="/" aria-current={isHome ? "page" : undefined}><FontAwesomeIcon icon={faHouse} fixedWidth />ホーム</Link>
        <Link className={`nav-link ${isMyRecipes ? "is-current" : ""}`} href="/mypage/recipes" aria-current={isMyRecipes ? "page" : undefined}><FontAwesomeIcon icon={faBookOpen} fixedWidth />マイレシピ</Link>
        <Link className={`nav-link ${isRecipes ? "is-current" : ""}`} href="/recipes" aria-current={isRecipes ? "page" : undefined}><FontAwesomeIcon icon={faMagnifyingGlass} fixedWidth />レシピを探す</Link>
      </nav>
      <div className="header-actions">
        <Link className="icon-button notification-button" href="/notices" aria-label={viewer.hasUnreadNotification ? "未読のお知らせがあります" : "お知らせ"}><FontAwesomeIcon icon={faBell} />{viewer.hasUnreadNotification ? <span className="notification-dot" aria-hidden="true" /> : null}</Link>
        <Link className="profile-button" href={viewer.signedIn ? "/mypage" : "/login"} aria-label={viewer.signedIn ? "マイページを開く" : "ログインする"}>
          {viewer.signedIn ? <ProfileAvatar avatarKind={viewer.avatarKind} presetKey={viewer.presetKey} color={viewer.color} imageUrl={viewer.avatarUrl} className="profile-avatar" /> : <span className="profile-avatar"><FontAwesomeIcon icon={faRightToBracket} /></span>}
          <span>{viewer.signedIn ? viewer.displayName || "マイページ" : "ログイン"}</span>
        </Link>
        <button ref={menuButtonRef} className="menu-button" type="button" aria-expanded={menuOpen} aria-controls="mobile-menu" aria-label={menuOpen ? "メニューを閉じる" : "メニューを開く"} onClick={() => setMenuOpen((current) => !current)}><FontAwesomeIcon icon={faBars} /></button>
      </div>
      {menuOpen ? (
        <nav ref={menuRef} className="mobile-menu" id="mobile-menu" aria-label="モバイルメニュー">
          <Link href="/" onClick={() => setMenuOpen(false)}>ホーム</Link>
          <Link href="/mypage/recipes" onClick={() => setMenuOpen(false)}>マイレシピ</Link>
          <Link href="/recipes" onClick={() => setMenuOpen(false)}>レシピを探す</Link>
          <Link href="/notices" onClick={() => setMenuOpen(false)}>お知らせ</Link>
          {viewer.signedIn ? <a href="/auth/signout" onClick={() => setMenuOpen(false)}><FontAwesomeIcon icon={faRightFromBracket} /> ログアウト</a> : <Link href="/login" onClick={() => setMenuOpen(false)}><FontAwesomeIcon icon={faRightToBracket} /> ログイン</Link>}
        </nav>
      ) : null}
    </header>
  );
}

export function SiteFooter() {
  return <footer className="site-footer"><p>Copyright © 2026 こまクック</p></footer>;
}

export function BottomNav() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isRegistering = pathname === "/recipes/new";
  const isRecipes = pathname.startsWith("/recipes") && !isRegistering;
  const isMyRecipes = pathname.startsWith("/mypage/recipes");
  const isMyPage = pathname === "/mypage" || pathname.startsWith("/settings");

  return (
    <nav className="bottom-nav" aria-label="スマートフォン用メニュー">
      <Link className={isHome ? "is-current" : ""} href="/" aria-current={isHome ? "page" : undefined}><FontAwesomeIcon icon={faHouse} /><span>ホーム</span></Link>
      <Link className={isRecipes ? "is-current" : ""} href="/recipes" aria-current={isRecipes ? "page" : undefined}><FontAwesomeIcon icon={faMagnifyingGlass} /><span>探す</span></Link>
      <Link className={isRegistering ? "is-current" : ""} href="/recipes/new" aria-label="レシピを登録" aria-current={isRegistering ? "page" : undefined}><span className="add-circle"><FontAwesomeIcon icon={faPlus} /></span><span>登録</span></Link>
      <Link className={isMyRecipes ? "is-current" : ""} href="/mypage/recipes" aria-current={isMyRecipes ? "page" : undefined}><FontAwesomeIcon icon={faBookOpen} /><span>レシピ</span></Link>
      <Link className={isMyPage ? "is-current" : ""} href="/mypage" aria-current={isMyPage ? "page" : undefined}><FontAwesomeIcon icon={faUser} /><span>マイページ</span></Link>
    </nav>
  );
}
