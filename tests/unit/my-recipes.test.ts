import { describe, expect, it } from "vitest";
import { filterAndSortMyRecipes, type MyRecipeTab } from "../../lib/my-recipes";

type TestRecipe = {
  id: string;
  name: string;
  category: string;
  tags: string[];
  tab: MyRecipeTab;
  updatedAt: string;
};

const recipes: TestRecipe[] = [
  { id: "1", name: "カレー10", category: "主食", tags: ["時短"], tab: "mine", updatedAt: "2026-09-01T00:00:00Z" },
  { id: "2", name: "カレー2", category: "主食", tags: ["作り置き"], tab: "mine", updatedAt: "2026-09-15T00:00:00Z" },
  { id: "3", name: "プリン", category: "デザート", tags: ["簡単"], tab: "favorites", updatedAt: "2026-09-10T00:00:00Z" },
];

describe("filterAndSortMyRecipes", () => {
  it("タブ、全カテゴリ、検索語、非表示IDを組み合わせて絞り込む", () => {
    const result = filterAndSortMyRecipes(recipes, {
      tab: "mine",
      query: "時短",
      category: "主食",
      sort: "updated-desc",
      hiddenIds: new Set(["2"]),
    });

    expect(result.map((recipe) => recipe.id)).toEqual(["1"]);
  });

  it("更新日時の新しい順と古い順を切り替える", () => {
    const common = { tab: "mine" as const, query: "", category: "" };
    expect(filterAndSortMyRecipes(recipes, { ...common, sort: "updated-desc" }).map((recipe) => recipe.id)).toEqual(["2", "1"]);
    expect(filterAndSortMyRecipes(recipes, { ...common, sort: "updated-asc" }).map((recipe) => recipe.id)).toEqual(["1", "2"]);
  });

  it("名前順は数字を含む名前も自然順で並べる", () => {
    const result = filterAndSortMyRecipes(recipes, { tab: "mine", query: "カレー", category: "", sort: "name-asc" });
    expect(result.map((recipe) => recipe.id)).toEqual(["2", "1"]);
  });
});
