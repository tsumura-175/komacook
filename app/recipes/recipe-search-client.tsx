"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookmark as faBookmarkRegular } from "@fortawesome/free-regular-svg-icons";
import { faBookmark, faChevronLeft, faChevronRight, faClock, faMagnifyingGlass, faRotateLeft, faSliders } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import { BottomNav, SiteFooter, SiteHeader } from "../components/site-shell";
import { RecipeThumbnail } from "../components/recipe-thumbnail";
import type { RecipeData } from "../../lib/recipes";
import { toggleFavorite } from "./actions";

type Options = { categories: Array<{ id: string; name: string }>; tags: string[]; ingredients: string[] };

export default function RecipeSearchClient({ recipes, total, page, pageSize, options, query, sort }: { recipes: RecipeData[]; total: number; page: number; pageSize: number; options: Options; query: string; sort: string }) {
  const router = useRouter(); const searchParams = useSearchParams();
  const [queryInput, setQueryInput] = useState(query); const [filtersOpen, setFiltersOpen] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState(() => new Set(recipes.filter((recipe) => recipe.favorite).map((recipe) => recipe.id)));
  const [pending, startTransition] = useTransition();
  const selectedTags = searchParams.getAll("tag");
  const activeFilterCount = [searchParams.get("category"), searchParams.get("time"), searchParams.get("ingredient"), searchParams.get("period"), searchParams.get("favorite"), ...selectedTags].filter(Boolean).length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  function navigate(changes: Record<string, string | string[] | null>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(changes).forEach(([name, value]) => { params.delete(name); if (Array.isArray(value)) value.forEach((item) => params.append(name, item)); else if (value) params.set(name, value); });
    if (!("page" in changes)) params.delete("page");
    startTransition(() => router.replace(params.size ? `/recipes?${params}` : "/recipes", { scroll: false }));
  }
  function submitSearch(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const value = queryInput.trim(); navigate({ q: value || null, sort: value ? "relevance" : "new" }); }
  function toggleTag(tag: string) { navigate({ tag: selectedTags.includes(tag) ? selectedTags.filter((item) => item !== tag) : [...selectedTags, tag] }); }
  function handleToggleFavorite(id: string) {
    const wasFavorite = favoriteIds.has(id);
    setFavoriteIds((current) => { const next = new Set(current); if (wasFavorite) next.delete(id); else next.add(id); return next; });
    startTransition(async () => { const result = await toggleFavorite(id); if (!result.ok) { setFavoriteIds((current) => { const next = new Set(current); if (wasFavorite) next.add(id); else next.delete(id); return next; }); if (result.error === "login_required") router.push(`/login?next=${encodeURIComponent(`/recipes?${searchParams}`)}`); } else if (searchParams.get("favorite") === "1") router.refresh(); });
  }
  function pageHref(target: number) { const params = new URLSearchParams(searchParams.toString()); if (target <= 1) params.delete("page"); else params.set("page", String(target)); return params.size ? `/recipes?${params}` : "/recipes"; }

  return <div className="app-shell search-page-shell"><SiteHeader /><main className="search-page-main" id="top" aria-busy={pending}>
    <header className="search-page-heading"><h1>レシピを探す</h1><p>料理名だけでなく、冷蔵庫にある材料や作りたい時間からも探せます。</p></header>
    <form className="recipe-search search-page-query" onSubmit={submitSearch} role="search"><div className="search-field"><FontAwesomeIcon className="search-icon" icon={faMagnifyingGlass} /><label className="sr-only" htmlFor="public-recipe-query">公開レシピを検索</label><input id="public-recipe-query" type="search" value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="料理名・材料・タグで探す" /></div><button type="submit" disabled={pending}>検索</button></form>
    <button className="mobile-filter-button" type="button" aria-expanded={filtersOpen} aria-controls="recipe-filters" onClick={() => setFiltersOpen((value) => !value)}><span><FontAwesomeIcon icon={faSliders} />絞り込み</span>{activeFilterCount ? <strong>{activeFilterCount}</strong> : null}</button>
    <div className="search-workbench"><aside className={`search-filters ${filtersOpen ? "is-open" : ""}`} id="recipe-filters" aria-label="検索条件">
      <div className="filter-heading"><h2>絞り込み</h2><button type="button" onClick={() => { setQueryInput(""); router.replace("/recipes", { scroll: false }); }}><FontAwesomeIcon icon={faRotateLeft} />条件をクリア</button></div>
      <div className="filter-pair"><div className="filter-field"><label htmlFor="filter-category">カテゴリ</label><select id="filter-category" value={searchParams.get("category") ?? ""} onChange={(event) => navigate({ category: event.target.value || null })}><option value="">すべて</option>{options.categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div><div className="filter-field"><label htmlFor="filter-ingredient">主な材料</label><select id="filter-ingredient" value={searchParams.get("ingredient") ?? ""} onChange={(event) => navigate({ ingredient: event.target.value || null })}><option value="">指定なし</option>{options.ingredients.map((item) => <option value={item} key={item}>{item}</option>)}</select></div></div>
      <fieldset className="filter-field filter-tags"><legend>タグ</legend><div>{options.tags.map((tag) => <button type="button" className={selectedTags.includes(tag) ? "is-selected" : ""} aria-pressed={selectedTags.includes(tag)} onClick={() => toggleTag(tag)} key={tag}>{tag}</button>)}</div></fieldset>
      <div className="filter-pair"><div className="filter-field"><label htmlFor="filter-time">調理時間</label><select id="filter-time" value={searchParams.get("time") ?? ""} onChange={(event) => navigate({ time: event.target.value || null })}><option value="">指定なし</option><option value="15">15分以内</option><option value="30">30分以内</option><option value="60">60分以内</option></select></div><div className="filter-field"><label htmlFor="filter-period">公開日</label><select id="filter-period" value={searchParams.get("period") ?? ""} onChange={(event) => navigate({ period: event.target.value || null })}><option value="">指定なし</option><option value="7">1週間以内</option><option value="30">1か月以内</option><option value="365">1年以内</option></select></div></div>
      <label className="favorite-filter"><input type="checkbox" checked={searchParams.get("favorite") === "1"} onChange={(event) => navigate({ favorite: event.target.checked ? "1" : null })} /><span>保存したレシピだけ表示</span></label>
    </aside><section className="search-results" aria-labelledby="search-results-title">
      <div className="results-heading"><div><h2 id="search-results-title">{query ? `「${query}」の検索結果` : "公開レシピ"}</h2><p><strong>{total}</strong>件見つかりました</p></div><label className="sort-control"><span>並び順</span><select value={sort} onChange={(event) => navigate({ sort: event.target.value })}>{query ? <option value="relevance">関連度順</option> : null}<option value="new">新着順</option><option value="saves">保存数が多い順</option></select></label></div>
      {recipes.length ? <><div className="search-result-grid">{recipes.map((recipe) => <article className="search-result-card" key={recipe.id}><Link className="result-image-link" href={`/recipes/${recipe.id}`} aria-label={`${recipe.title}を見る`}><RecipeThumbnail imageUrl={recipe.imageUrl} title={recipe.title} sizes="(max-width: 600px) 100vw, (max-width: 960px) 50vw, 32vw" /></Link><div className="result-card-body"><div className="result-card-meta"><span><FontAwesomeIcon icon={faClock} />{recipe.cookingTime ? `${recipe.cookingTime}分` : "時間未設定"}</span><span><FontAwesomeIcon icon={faBookmark} />{recipe.saveCount + (favoriteIds.has(recipe.id) === recipe.favorite ? 0 : favoriteIds.has(recipe.id) ? 1 : -1)}</span></div><h3><Link href={`/recipes/${recipe.id}`}>{recipe.title}</Link></h3><p>{recipe.description}</p><div className="recipe-tags" aria-label={`${recipe.title}の分類`}><span className="recipe-tag">{recipe.category}</span>{recipe.tags.map((tag) => <span className="recipe-tag" key={tag}>{tag}</span>)}</div><div className="result-card-footer"><span>{recipe.author}</span>{recipe.ownerUserId !== recipe.viewerUserId ? <button type="button" className={`save-button ${favoriteIds.has(recipe.id) ? "is-saved" : ""}`} aria-label={`${recipe.title}を${favoriteIds.has(recipe.id) ? "保存から外す" : "保存する"}`} aria-pressed={favoriteIds.has(recipe.id)} onClick={() => handleToggleFavorite(recipe.id)}><FontAwesomeIcon icon={favoriteIds.has(recipe.id) ? faBookmark : faBookmarkRegular} /></button> : null}</div></div></article>)}</div>
      {pageCount > 1 ? <nav className="pagination" aria-label="検索結果のページ"><Link className={page <= 1 ? "is-disabled" : ""} aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined} href={pageHref(page - 1)}><FontAwesomeIcon icon={faChevronLeft} />前へ</Link><span>{page} / {pageCount}</span><Link className={page >= pageCount ? "is-disabled" : ""} aria-disabled={page >= pageCount} tabIndex={page >= pageCount ? -1 : undefined} href={pageHref(page + 1)}>次へ<FontAwesomeIcon icon={faChevronRight} /></Link></nav> : null}</> : <div className="empty-search-result"><FontAwesomeIcon icon={faMagnifyingGlass} /><h3>{query || activeFilterCount ? "条件に合うレシピがありません" : "公開レシピはまだありません"}</h3><p>{query || activeFilterCount ? "条件を減らすか、別のキーワードで検索してください。" : "最初のレシピが公開されるまで、しばらくお待ちください。"}</p>{query || activeFilterCount ? <button type="button" onClick={() => router.replace("/recipes")}>条件をすべてクリア <FontAwesomeIcon icon={faChevronRight} /></button> : null}</div>}
    </section></div>
  </main><SiteFooter /><BottomNav /></div>;
}
