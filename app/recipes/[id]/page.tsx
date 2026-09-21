import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getRecipe } from "../../../lib/recipes";
import { getSiteUrl } from "../../../lib/site-url";
import RecipeDetailClient from "./recipe-detail-client";

const getCachedRecipe = cache(getRecipe);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const recipe = await getCachedRecipe(id);
  if (!recipe) return { title: "レシピが見つかりません｜こまクック" };
  const isPublic = recipe.visibility === "public" && recipe.status === "published";
  const canonical = `${getSiteUrl()}/recipes/${recipe.id}`;
  return {
    title: `${recipe.title}｜こまクック`, description: recipe.description,
    alternates: isPublic ? { canonical } : undefined,
    robots: isPublic ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: isPublic ? { type: "article", url: canonical, title: recipe.title, description: recipe.description, images: [{ url: recipe.imageUrl ?? `${getSiteUrl()}/brand/komacook-poodle-chef.png`, alt: recipe.title }], publishedTime: recipe.publishedAt ?? undefined, modifiedTime: recipe.updatedAt } : undefined,
  };
}

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipe = await getCachedRecipe(id);
  if (!recipe) notFound();
  const isPublic = recipe.visibility === "public" && recipe.status === "published";
  const canonicalUrl = `${getSiteUrl()}/recipes/${recipe.id}`;
  const structuredData = isPublic ? {
    "@context": "https://schema.org", "@type": "Recipe", name: recipe.title, description: recipe.description,
    image: [recipe.imageUrl ?? `${getSiteUrl()}/brand/komacook-poodle-chef.png`], author: { "@type": "Person", name: recipe.author },
    datePublished: recipe.publishedAt, dateModified: recipe.updatedAt, recipeYield: `${recipe.baseServings}人分`, totalTime: recipe.cookingTime ? `PT${recipe.cookingTime}M` : undefined,
    nutrition: recipe.calories ? { "@type": "NutritionInformation", calories: `${recipe.calories} kcal` } : undefined,
    recipeIngredient: recipe.ingredients.map((item) => `${item.name} ${item.quantityText ?? `${item.quantityDisplay ?? item.quantityValue ?? ""}${item.unit ?? ""}`}`.trim()),
    recipeInstructions: recipe.steps.map((step) => ({ "@type": "HowToStep", text: step.instruction })),
  } : null;
  return <>{structuredData ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} /> : null}<RecipeDetailClient recipe={recipe} canonicalUrl={canonicalUrl} /></>;
}
