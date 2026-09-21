import type { MyRecipeTab } from "./my-recipes";

export type { MyRecipeTab } from "./my-recipes";

export type MyRecipe = {
  id: string;
  name: string;
  category: string;
  tags: string[];
  time: number;
  visibility: string;
  source: string;
  tab: MyRecipeTab;
  updatedAt: string;
  updatedLabel: string;
  imageUrl: string | null;
};
