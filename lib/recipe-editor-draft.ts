import type { RecipeInput } from "../app/recipes/actions";

export type LocalPublishedDraft = { version: 1; savedAt: string; input: RecipeInput };
type VersionedRecipe = { id: string; lock_version: number };

export function localPublishedDraftKey(recipeId: string) {
  return `komacook:published-recipe-draft:${recipeId}`;
}

export function readLocalPublishedDraft(recipe: VersionedRecipe): LocalPublishedDraft | null {
  try {
    const raw = window.localStorage.getItem(localPublishedDraftKey(recipe.id));
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<LocalPublishedDraft>;
    if (draft.version !== 1 || !draft.input || draft.input.id !== recipe.id || draft.input.lockVersion !== Number(recipe.lock_version)) return null;
    return draft as LocalPublishedDraft;
  } catch {
    return null;
  }
}
