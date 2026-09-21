import type { MetadataRoute } from "next";
import { getPublicRecipes } from "../lib/recipes";
import { getSiteUrl } from "../lib/site-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  let recipes: Awaited<ReturnType<typeof getPublicRecipes>> = [];
  try { recipes = await getPublicRecipes(); } catch { /* Keep static routes available when the database is temporarily unavailable. */ }
  return [
    { url: siteUrl, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/recipes`, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/notices`, changeFrequency: "weekly", priority: 0.4 },
    ...recipes.map((recipe) => ({ url: `${siteUrl}/recipes/${recipe.id}`, lastModified: new Date(recipe.updatedAt), changeFrequency: "weekly" as const, priority: 0.7 })),
  ];
}
