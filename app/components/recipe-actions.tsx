"use client";

import { faBookmark as faBookmarkRegular } from "@fortawesome/free-regular-svg-icons";
import { faBookmark, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { usePathname, useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { copyRecipe, toggleFavorite } from "../recipes/actions";

function useLoginRedirect() {
  const pathname = usePathname();
  const router = useRouter();
  return () => router.push(`/login?next=${encodeURIComponent(pathname)}`);
}

export function FavoriteButton({ recipeId, recipeName, initialFavorite }: { recipeId: string; recipeName: string; initialFavorite: boolean }) {
  const [active, setOptimistic] = useOptimistic(initialFavorite);
  const [pending, startTransition] = useTransition();
  const redirectToLogin = useLoginRedirect();
  const icon = active ? faBookmark : faBookmarkRegular;
  return <button type="button" disabled={pending} className={`save-button ${active ? "is-saved" : ""}`} aria-label={`${recipeName}を保存${active ? "から外す" : "する"}`} aria-pressed={active} onClick={() => startTransition(async () => {
    setOptimistic(!active);
    const result = await toggleFavorite(recipeId);
    if (!result.ok && result.error === "login_required") redirectToLogin();
  })}><FontAwesomeIcon icon={icon} /></button>;
}

export function CopyRecipeButton({ recipeId }: { recipeId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const redirectToLogin = useLoginRedirect();
  return <button className="copy-recipe-button" type="button" disabled={pending} onClick={() => startTransition(async () => {
    const result = await copyRecipe(recipeId);
    if (!result.ok && result.error === "login_required") { redirectToLogin(); return; }
    if (result.ok && result.id) router.push(`/recipes/${result.id}/edit`);
  })}><FontAwesomeIcon icon={faCopy} /><span><strong>{pending ? "コピー中…" : "自分用にコピー"}</strong><small>非公開レシピとして保存されます</small></span></button>;
}
