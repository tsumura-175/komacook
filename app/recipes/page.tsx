import { getSearchOptions, searchPublicRecipes } from "../../lib/recipes";
import RecipeSearchClient from "./recipe-search-client";

type SearchParams = Record<string, string | string[] | undefined>;
const single = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
function positiveNumber(value: string, allowed?: number[]) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 && (!allowed || allowed.includes(parsed)) ? parsed : undefined; }

export default async function RecipesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = single(params.q).trim();
  const requestedSort = single(params.sort);
  const sort = requestedSort === "saves" || requestedSort === "new" || (requestedSort === "relevance" && query) ? requestedSort : query ? "relevance" : "new";
  const page = positiveNumber(single(params.page)) ?? 1;
  const tags = (Array.isArray(params.tag) ? params.tag : params.tag ? [params.tag] : []).filter(Boolean);
  const [result, options] = await Promise.all([
    searchPublicRecipes({ query, categoryId: single(params.category), tags, maxTime: positiveNumber(single(params.time), [15, 30, 60]), ingredient: single(params.ingredient), periodDays: positiveNumber(single(params.period), [7, 30, 365]), favoritesOnly: single(params.favorite) === "1", sort, page }),
    getSearchOptions(),
  ]);
  return <RecipeSearchClient key={new URLSearchParams(Object.entries(params).flatMap(([key, value]) => Array.isArray(value) ? value.map((item) => [key, item]) : value ? [[key, value]] : [])).toString()} {...result} options={options} query={query} sort={sort} />;
}
