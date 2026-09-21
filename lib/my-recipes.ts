export type MyRecipeTab = "mine" | "favorites" | "drafts" | "trash";

export type MyRecipeSort = "updated-desc" | "updated-asc" | "name-asc";

type SortableMyRecipe = {
  id: string;
  name: string;
  category: string;
  tags: string[];
  tab: MyRecipeTab;
  updatedAt: string;
};

type MyRecipeFilters = {
  tab: MyRecipeTab;
  query: string;
  category: string;
  sort: MyRecipeSort;
  hiddenIds?: ReadonlySet<string>;
};

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function filterAndSortMyRecipes<T extends SortableMyRecipe>(recipes: readonly T[], filters: MyRecipeFilters): T[] {
  const normalizedQuery = filters.query.trim().toLocaleLowerCase("ja-JP");

  return recipes
    .filter((recipe) => {
      if (recipe.tab !== filters.tab || filters.hiddenIds?.has(recipe.id)) return false;
      if (filters.category && recipe.category !== filters.category) return false;
      if (!normalizedQuery) return true;
      return [recipe.name, recipe.category, ...recipe.tags]
        .join(" ")
        .toLocaleLowerCase("ja-JP")
        .includes(normalizedQuery);
    })
    .toSorted((a, b) => {
      if (filters.sort === "name-asc") {
        return a.name.localeCompare(b.name, "ja", { numeric: true, sensitivity: "base" });
      }
      const difference = timestamp(a.updatedAt) - timestamp(b.updatedAt);
      return filters.sort === "updated-asc" ? difference : -difference;
    });
}
