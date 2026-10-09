"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookmark as faBookmarkRegular } from "@fortawesome/free-regular-svg-icons";
import { faMagnifyingGlass, faPlus, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { BottomNav, SiteFooter, SiteHeader } from "../../components/site-shell";
import { RecipeDeleteDialog } from "../../components/recipe-delete-dialog";
import { MyRecipeCard } from "../../components/my-recipe-card";
import { filterAndSortMyRecipes, type MyRecipeSort, type MyRecipeTab } from "../../../lib/my-recipes";
import type { MyRecipe } from "../../../lib/my-recipe-types";
import { permanentlyDeleteRecipe, restoreRecipe, toggleFavorite } from "../../recipes/actions";

type TabId = MyRecipeTab;

const tabs: { id: TabId; label: string }[] = [
  { id: "mine", label: "自分のレシピ" },
  { id: "favorites", label: "保存したレシピ" },
  { id: "drafts", label: "下書き" },
  { id: "trash", label: "ゴミ箱" },
];

export default function MyRecipesPage() {
  const [activeTab, setActiveTab] = useState<TabId>("mine");
  const [recipes, setRecipes] = useState<MyRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<MyRecipeSort>("updated-desc");
  const [categories, setCategories] = useState<string[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [savedRecipeIds, setSavedRecipeIds] = useState<Set<string>>(() => new Set());
  const [pendingSaveIds, setPendingSaveIds] = useState<Set<string>>(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState<MyRecipe | null>(null);
  const [actionStatus, setActionStatus] = useState("");

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    const requestedTabId = tabs.some((tab) => tab.id === requestedTab) ? requestedTab as TabId : null;
    const tabTimer = requestedTabId ? window.setTimeout(() => setActiveTab(requestedTabId), 0) : undefined;
    let cancelled = false;
    async function loadRecipes() {
      try {
        const response = await fetch("/api/my-recipes", { cache: "no-store" });
        const payload = await response.json() as { recipes?: MyRecipe[]; categories?: string[]; savedRecipeIds?: string[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "マイレシピを読み込めませんでした。時間をおいて再度お試しください。");
        if (cancelled) return;
        setCategories(payload.categories ?? []);
        setSavedRecipeIds(new Set(payload.savedRecipeIds ?? []));
        setRecipes(payload.recipes ?? []);
        // 作成済みが下書きだけの場合、「自分のレシピ」初期タブでは0件に
        // 見える。URLで明示指定されていないときは、実データのある下書きを開く。
        if (!requestedTabId && !(payload.recipes ?? []).some((recipe) => recipe.tab === "mine") && (payload.recipes ?? []).some((recipe) => recipe.tab === "drafts")) {
          setActiveTab("drafts");
        }
      } catch (error) {
        if (!cancelled) setActionStatus(error instanceof Error ? error.message : "マイレシピを読み込めませんでした。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadRecipes();
    return () => {
      cancelled = true;
      if (tabTimer !== undefined) window.clearTimeout(tabTimer);
    };
  }, []);

  const filtered = useMemo(() => filterAndSortMyRecipes(recipes, {
    tab: activeTab,
    query,
    category,
    sort,
    hiddenIds,
  }), [activeTab, category, hiddenIds, query, recipes, sort]);
  const firstVisibleImageId = filtered.find((recipe) => recipe.imageUrl)?.id;

  const tabTitle = tabs.find((tab) => tab.id === activeTab)?.label ?? "マイレシピ";

  function toggleSavedRecipe(id: string) {
    if (pendingSaveIds.has(id)) return;
    const wasSaved = savedRecipeIds.has(id);
    setActionStatus("");
    setSavedRecipeIds((current) => {
      const next = new Set(current);
      if (wasSaved) next.delete(id); else next.add(id);
      return next;
    });
    setPendingSaveIds((current) => new Set(current).add(id));
    startTransition(async () => {
      try {
        const result = await toggleFavorite(id);
        if (!result.ok) throw new Error(result.error ?? "保存状態を変更できませんでした。");
        setSavedRecipeIds((current) => {
          const next = new Set(current);
          if (result.active) next.add(id); else next.delete(id);
          return next;
        });
      } catch (error) {
        setSavedRecipeIds((current) => {
          const next = new Set(current);
          if (wasSaved) next.add(id); else next.delete(id);
          return next;
        });
        setActionStatus(error instanceof Error ? error.message : "保存状態を変更できませんでした。元の状態に戻しました。");
      } finally {
        setPendingSaveIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    });
  }

  function restore(id: string) {
    setActionStatus("");
    startTransition(async () => {
      try {
        const result = await restoreRecipe(id);
        if (!result.ok) throw new Error(result.error ?? "レシピを元に戻せませんでした。");
        setHiddenIds((ids) => new Set(ids).add(id));
      } catch (error) {
        setActionStatus(error instanceof Error ? error.message : "レシピを元に戻せませんでした。一覧は変更されていません。");
      }
    });
  }

  function removePermanently() {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id;
    setActionStatus("");
    startTransition(async () => {
      try {
        const result = await permanentlyDeleteRecipe(targetId);
        if (!result.ok) throw new Error(result.error ?? "レシピを完全削除できませんでした。");
        setHiddenIds((ids) => new Set(ids).add(targetId));
        setDeleteTarget(null);
      } catch (error) {
        setActionStatus(error instanceof Error ? error.message : "レシピを完全削除できませんでした。一覧は変更されていません。");
      }
    });
  }

  return (
    <div className="app-shell member-page-shell">
      <SiteHeader />
      <main className="member-page-main my-recipes-main">
        <header className="member-page-heading">
          <div><h1>マイレシピ</h1><p>自分のレシピと、あとで作りたいレシピを整理できます。</p></div>
          <Link className="primary-action" href="/recipes/new"><FontAwesomeIcon icon={faPlus} />レシピを登録</Link>
        </header>

        <div className="member-tabs" role="tablist" aria-label="レシピの分類">
          {tabs.map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls="recipe-tab-panel" className={activeTab === tab.id ? "is-active" : ""} onClick={() => { setActiveTab(tab.id); setQuery(""); setCategory(""); setActionStatus(""); }} key={tab.id}>{tab.label}</button>)}
        </div>

        <section className="my-recipe-tools" aria-label={`${tabTitle}を検索`}>
          <label className="compact-search"><FontAwesomeIcon icon={faMagnifyingGlass} /><span className="sr-only">{tabTitle}を検索</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="料理名・タグで検索" /></label>
          <label className="compact-select"><span>カテゴリ</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">すべて</option>{categories.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
          <label className="compact-select"><span>並び順</span><select value={sort} onChange={(event) => setSort(event.target.value as MyRecipeSort)}><option value="updated-desc">更新が新しい順</option><option value="updated-asc">更新が古い順</option><option value="name-asc">名前順</option></select></label>
        </section>

        <section id="recipe-tab-panel" role="tabpanel" aria-label={tabTitle}>
          <div className="member-section-heading">
            <div><h2>{tabTitle}</h2><p>{filtered.length}件表示しています</p></div>
          </div>
          {actionStatus ? <p className="auth-error" role="alert">{actionStatus}</p> : null}

          {loading ? <div className="search-page-loading" aria-live="polite">マイレシピを読み込んでいます</div> : filtered.length ? (
            <div className="my-recipe-grid">
              {filtered.map((recipe) => <MyRecipeCard key={recipe.id} recipe={recipe} activeTab={activeTab} isSaved={savedRecipeIds.has(recipe.id)} isSavePending={pendingSaveIds.has(recipe.id)} priority={recipe.id === firstVisibleImageId} pending={pending} onRestore={restore} onDelete={setDeleteTarget} onToggleSaved={toggleSavedRecipe} />)}
            </div>
          ) : (
            <div className="member-empty member-empty-large"><FontAwesomeIcon icon={activeTab === "trash" ? faTrashCan : faBookmarkRegular} /><h2>{query || category ? "条件に合うレシピがありません" : `${tabTitle}はありません`}</h2><p>{activeTab === "trash" ? "削除したレシピは30日間ここに保管されます。" : "検索条件を変えるか、レシピを追加してみてください。"}</p>{query || category ? <button type="button" onClick={() => { setQuery(""); setCategory(""); }}>条件をクリア</button> : null}</div>
          )}
        </section>
      </main>
      <RecipeDeleteDialog
        open={Boolean(deleteTarget)}
        title="このレシピを完全に削除しますか？"
        description={`「${deleteTarget?.name ?? "レシピ"}」と完成写真を完全に削除します。この操作は取り消せません。`}
        confirmLabel="完全に削除する"
        pending={pending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={removePermanently}
      />
      <SiteFooter />
      <BottomNav />
    </div>
  );
}
