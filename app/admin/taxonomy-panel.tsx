import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faMagnifyingGlass, faPlus, faTags } from "@fortawesome/free-solid-svg-icons";
import { createClient } from "../../lib/supabase/server";
import { saveCategory, saveTag, toggleCategory, toggleTag } from "./actions";
import { ResultMessage } from "./moderation-panels";

type CategoryRow = { id: string; slug: string; name: string; sort_order: number; is_active: boolean };
type TagRow = { id: string; name: string; is_active: boolean; created_at: string };

export async function AdminTaxonomyPanel({ query, result }: { query: string; result?: string }) {
  const supabase = await createClient();
  let tagRequest = supabase.from("tags").select("id,name,is_active,created_at").order("is_active", { ascending: false }).order("name");
  if (query) tagRequest = tagRequest.ilike("name", `%${query}%`);
  const [categoryResult, tagResult, recipeCategories, recipeTags] = await Promise.all([
    supabase.from("categories").select("id,slug,name,sort_order,is_active").order("sort_order").order("name"),
    tagRequest,
    supabase.from("recipes").select("category_id"),
    supabase.from("recipe_tags").select("tag_id"),
  ]);
  const categories = (categoryResult.data ?? []) as CategoryRow[];
  const tags = (tagResult.data ?? []) as TagRow[];
  const categoryCounts = new Map<string, number>();
  for (const recipe of recipeCategories.data ?? []) categoryCounts.set(recipe.category_id, (categoryCounts.get(recipe.category_id) ?? 0) + 1);
  const tagCounts = new Map<string, number>();
  for (const relation of recipeTags.data ?? []) tagCounts.set(relation.tag_id, (tagCounts.get(relation.tag_id) ?? 0) + 1);
  const hasError = categoryResult.error || tagResult.error || recipeCategories.error || recipeTags.error;

  return <div className="admin-workspace taxonomy-workspace">
    <ResultMessage result={result} />
    {hasError ? <div className="member-empty"><h3>タグ・カテゴリを取得できませんでした</h3><p>Supabaseのmigration適用状況を確認してください。</p></div> : <>
      <section className="taxonomy-section" aria-labelledby="category-heading">
        <div className="taxonomy-section-heading"><div><h3 id="category-heading">固定カテゴリ</h3><p>レシピ登録時に1つ選ぶ分類です。表示順は小さい数字が先になります。</p></div><span>{categories.length}件</span></div>
        <details className="taxonomy-create"><summary><span><FontAwesomeIcon icon={faPlus} />カテゴリを追加</span><FontAwesomeIcon icon={faChevronDown} /></summary><form action={saveCategory.bind(null, undefined)} className="taxonomy-form"><label><span>カテゴリ名</span><input name="name" required maxLength={30} placeholder="例：おつまみ" /></label><label className="taxonomy-order-field"><span>表示順</span><input name="sort_order" required type="number" min={0} max={32767} defaultValue={(categories.at(-1)?.sort_order ?? 0) + 10} /></label><button className="primary-action" type="submit">追加する</button></form></details>
        <div className="taxonomy-list">{categories.map((category) => {
          const usageCount = categoryCounts.get(category.id) ?? 0;
          const canDeactivate = category.slug !== "other" && usageCount === 0;
          return <article className={`taxonomy-card ${category.is_active ? "" : "is-inactive"}`} key={category.id}>
            <div className="taxonomy-card-meta"><span className={`status-badge ${category.is_active ? "" : "status-dismissed"}`}>{category.is_active ? "有効" : "無効"}</span><strong>{category.name}</strong><small>{usageCount}件のレシピで使用</small></div>
            <form action={saveCategory.bind(null, category.id)} className="taxonomy-form"><label><span>カテゴリ名</span><input name="name" required maxLength={30} defaultValue={category.name} /></label><label className="taxonomy-order-field"><span>表示順</span><input name="sort_order" required type="number" min={0} max={32767} defaultValue={category.sort_order} /></label><button className="outline-action" type="submit">変更を保存</button></form>
            <form action={toggleCategory.bind(null, category.id)} className="taxonomy-toggle"><input type="hidden" name="active" value={String(!category.is_active)} /><button className="taxonomy-text-button" type="submit" disabled={category.is_active && !canDeactivate}>{category.is_active ? "無効にする" : "有効にする"}</button>{category.is_active && !canDeactivate ? <small>{category.slug === "other" ? "必須カテゴリのため無効化不可" : "使用中のため無効化不可"}</small> : null}</form>
          </article>;
        })}</div>
      </section>

      <section className="taxonomy-section" aria-labelledby="tag-heading">
        <div className="taxonomy-section-heading"><div><h3 id="tag-heading">ユーザータグ</h3><p>会員がレシピへ付けたタグです。無効化すると検索・表示対象から外れ、再有効化できます。</p></div><span>{tags.length}件</span></div>
        <form className="taxonomy-search" method="get"><FontAwesomeIcon icon={faMagnifyingGlass} /><input name="q" defaultValue={query} placeholder="タグ名で検索" /><button className="outline-action" type="submit">検索</button></form>
        {tags.length ? <div className="taxonomy-tag-grid">{tags.map((tag) => <article className={`taxonomy-tag-card ${tag.is_active ? "" : "is-inactive"}`} key={tag.id}>
          <div><FontAwesomeIcon icon={faTags} /><span className={`status-badge ${tag.is_active ? "" : "status-dismissed"}`}>{tag.is_active ? "有効" : "無効"}<small>{tagCounts.get(tag.id) ?? 0}件</small></span></div>
          <form action={saveTag.bind(null, tag.id)} className="taxonomy-tag-form"><label><span className="sr-only">タグ名</span><input name="name" required maxLength={20} defaultValue={tag.name} /></label><button className="outline-action" type="submit">保存</button></form>
          <form action={toggleTag.bind(null, tag.id)}><input type="hidden" name="active" value={String(!tag.is_active)} /><button className="taxonomy-text-button" type="submit">{tag.is_active ? "無効にする" : "有効にする"}</button></form>
        </article>)}</div> : <div className="member-empty"><h3>該当するタグはありません</h3><p>検索語を変更してください。</p></div>}
      </section>
    </>}
  </div>;
}
