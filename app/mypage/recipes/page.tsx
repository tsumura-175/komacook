"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookmark as faBookmarkRegular } from "@fortawesome/free-regular-svg-icons";
import {
  faBookmark,
  faClock,
  faCopy,
  faFloppyDisk,
  faGlobe,
  faLock,
  faMagnifyingGlass,
  faPenToSquare,
  faPlus,
  faRotateLeft,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { BottomNav, SiteFooter, SiteHeader } from "../../components/site-shell";
import { RecipeDeleteDialog } from "../../components/recipe-delete-dialog";
import { filterAndSortMyRecipes, type MyRecipeSort, type MyRecipeTab } from "../../../lib/my-recipes";
import { createClient } from "../../../lib/supabase/client";
import { permanentlyDeleteRecipe, restoreRecipe, toggleFavorite } from "../../recipes/actions";
import { RecipeThumbnail } from "../../components/recipe-thumbnail";

type TabId = MyRecipeTab;

const tabs: { id: TabId; label: string }[] = [
  { id: "mine", label: "自分のレシピ" },
  { id: "favorites", label: "保存したレシピ" },
  { id: "drafts", label: "下書き" },
  { id: "trash", label: "ゴミ箱" },
];

type MyRecipe = {
  id: string;
  name: string;
  category: string;
  tags: string[];
  time: number;
  visibility: string;
  source: string;
  tab: TabId;
  updatedAt: string;
  updatedLabel: string;
  imageUrl: string | null;
};

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
    const supabase = createClient();
    let cancelled = false;
    async function loadRecipes() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) throw new Error("ログイン状態を確認できませんでした。");
        const [mineResult, favoriteResult, categoryResult] = await Promise.all([
          supabase.from("recipes").select("id, title, cooking_time_minutes, visibility, status, source_type, updated_at, purge_after, image_path, categories(name), recipe_tags(tags(name))").eq("owner_user_id", authData.user.id).order("updated_at", { ascending: false }),
          supabase.from("favorites").select("recipe_id, recipes(id, title, cooking_time_minutes, visibility, updated_at, image_path, categories(name), recipe_tags(tags(name)))").eq("user_id", authData.user.id).order("created_at", { ascending: false }),
          supabase.from("categories").select("name").eq("is_active", true).order("sort_order"),
        ]);
        if (mineResult.error || favoriteResult.error || categoryResult.error) {
          throw new Error("マイレシピを読み込めませんでした。時間をおいて再度お試しください。");
        }

        const favoriteRecipes = (favoriteResult.data ?? []).flatMap((row) => {
          const recipe = Array.isArray(row.recipes) ? row.recipes[0] : row.recipes;
          return recipe ? [recipe] : [];
        });
        const imagePaths = [...new Set([...(mineResult.data ?? []), ...favoriteRecipes]
          .flatMap((recipe) => recipe.image_path ? [recipe.image_path] : []))];
        const signedUrlMap = new Map<string, string>();
        let imageLoadFailed = false;
        if (imagePaths.length) {
          const { data: signedImages, error: signedImagesError } = await supabase.storage.from("recipe-images").createSignedUrls(imagePaths, 3600);
          imageLoadFailed = Boolean(signedImagesError) || (signedImages ?? []).some((image) => Boolean(image.error));
          for (const image of signedImages ?? []) {
            if (image.path && image.signedUrl) signedUrlMap.set(image.path, image.signedUrl);
          }
        }

        const relationName = (value: unknown) => { const item = Array.isArray(value) ? value[0] : value; return item && typeof item === "object" && "name" in item ? String(item.name) : "その他"; };
        const relationTags = (value: unknown) => Array.isArray(value) ? value.flatMap((item) => item && typeof item === "object" && "tags" in item ? [relationName(item.tags)] : []) : [];
        const ownRows: MyRecipe[] = (mineResult.data ?? []).map((recipe) => ({
          id: recipe.id, name: recipe.title, category: relationName(recipe.categories), tags: relationTags(recipe.recipe_tags), time: recipe.cooking_time_minutes ?? 0,
          visibility: recipe.visibility === "public" ? "公開" : "非公開", source: recipe.status === "deleted" ? "削除済み" : recipe.status === "draft" ? "下書き" : recipe.source_type === "copied" ? "コピー" : "手入力",
          tab: recipe.status === "deleted" ? "trash" : recipe.status === "draft" ? "drafts" : "mine", updatedAt: recipe.updated_at,
          updatedLabel: recipe.status === "deleted" && recipe.purge_after ? `あと${Math.max(0, Math.ceil((new Date(recipe.purge_after).getTime() - Date.now()) / 86400000))}日` : new Date(recipe.updated_at).toLocaleDateString("ja-JP"),
          imageUrl: recipe.image_path ? signedUrlMap.get(recipe.image_path) ?? null : null,
        }));
        const favoriteRows: MyRecipe[] = favoriteRecipes.map((recipe) => ({
          id: recipe.id, name: recipe.title, category: relationName(recipe.categories), tags: relationTags(recipe.recipe_tags), time: recipe.cooking_time_minutes ?? 0,
          visibility: "公開", source: "保存済み", tab: "favorites", updatedAt: recipe.updated_at, updatedLabel: new Date(recipe.updated_at).toLocaleDateString("ja-JP"),
          imageUrl: recipe.image_path ? signedUrlMap.get(recipe.image_path) ?? null : null,
        }));
        if (cancelled) return;
        setCategories((categoryResult.data ?? []).map((item) => item.name));
        setSavedRecipeIds(new Set(favoriteRows.map((recipe) => recipe.id)));
        setRecipes([...ownRows, ...favoriteRows]);
        if (imageLoadFailed) setActionStatus("一部の完成写真を読み込めませんでした。時間をおいて再度お試しください。");
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
              {filtered.map((recipe) => {
                const isSaved = savedRecipeIds.has(recipe.id);
                const isSavePending = pendingSaveIds.has(recipe.id);
                const sourceLabel = recipe.tab === "favorites" && !isSaved ? "保存解除済み" : recipe.source;
                return <article className={`my-recipe-card ${recipe.tab === "favorites" && !isSaved ? "is-save-removed" : ""}`} key={recipe.id}>
                <div className="my-recipe-image"><RecipeThumbnail imageUrl={recipe.imageUrl} title={recipe.name} priority={recipe.id === firstVisibleImageId} sizes="(max-width: 600px) 100vw, (max-width: 960px) 50vw, 33vw" /></div>
                <div className="my-recipe-body">
                  <div className="my-recipe-badges"><span>{recipe.source === "手入力" ? <FontAwesomeIcon icon={faPenToSquare} /> : recipe.source === "コピー" ? <FontAwesomeIcon icon={faCopy} /> : recipe.source === "保存済み" ? <FontAwesomeIcon icon={isSaved ? faBookmark : faBookmarkRegular} /> : recipe.source === "削除済み" ? <FontAwesomeIcon icon={faTrashCan} /> : <FontAwesomeIcon icon={faFloppyDisk} />}{sourceLabel}</span><span>{recipe.visibility === "公開" ? <FontAwesomeIcon icon={faGlobe} /> : <FontAwesomeIcon icon={faLock} />}{recipe.visibility}</span></div>
                  <h3>{recipe.name}</h3>
                  <div className="recipe-tags">{recipe.tags.map((tag) => <span className="recipe-tag" key={tag}>{tag}</span>)}</div>
                  <div className="my-recipe-meta"><span><FontAwesomeIcon icon={faClock} />{recipe.time}分</span><span>{activeTab === "trash" ? `完全削除まで：${recipe.updatedLabel}` : `更新：${recipe.updatedLabel}`}</span></div>
                  <div className="my-recipe-actions">
                    {activeTab === "trash" ? <><button className="secondary-button" type="button" disabled={pending} onClick={() => restore(recipe.id)}><FontAwesomeIcon icon={faRotateLeft} />元に戻す</button><button className="outline-icon-button" type="button" disabled={pending} aria-label={`${recipe.name}を完全に削除`} onClick={() => setDeleteTarget(recipe)}><FontAwesomeIcon icon={faTrashCan} /></button></> : <><Link className="secondary-button" href={activeTab === "drafts" ? `/recipes/${recipe.id}/edit` : `/recipes/${recipe.id}`}>{activeTab === "drafts" ? "編集を続ける" : "レシピを見る"}</Link>{activeTab === "favorites" ? <button className={`save-button ${isSaved ? "is-saved" : ""}`} type="button" aria-label={isSaved ? `${recipe.name}を保存から外す` : `${recipe.name}をもう一度保存する`} aria-pressed={isSaved} disabled={isSavePending} onClick={() => toggleSavedRecipe(recipe.id)}><FontAwesomeIcon icon={isSaved ? faBookmark : faBookmarkRegular} /></button> : <Link className="outline-icon-button" href={`/recipes/${recipe.id}/edit`} aria-label={`${recipe.name}を編集`}><FontAwesomeIcon icon={faPenToSquare} /></Link>}</>}
                  </div>
                  {recipe.tab === "favorites" && !isSaved ? <p className="save-removal-note" role="status">画面を移動すると、この一覧から外れます。</p> : null}
                </div>
              </article>;
              })}
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
