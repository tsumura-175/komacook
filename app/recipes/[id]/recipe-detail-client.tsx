"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLine } from "@fortawesome/free-brands-svg-icons";
import { faBookmark as faBookmarkRegular } from "@fortawesome/free-regular-svg-icons";
import {
  faBookmark as faBookmarkSolid,
  faChevronLeft,
  faClock,
  faFire,
  faLink,
  faMinus,
  faPlus,
  faShareNodes,
  faTriangleExclamation,
  faUserGroup,
} from "@fortawesome/free-solid-svg-icons";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { BottomNav, BrandMark, SiteFooter, SiteHeader } from "../../components/site-shell";
import { CopyRecipeButton } from "../../components/recipe-actions";
import { RecipeThumbnail } from "../../components/recipe-thumbnail";
import { ReportButton } from "../../components/report-button";
import type { RecipeData, RecipeIngredient } from "../../../lib/recipes";
import { toggleFavorite } from "../actions";

function formatMixedFraction(value: number) {
  const rounded = Math.round(value * 4) / 4;
  const whole = Math.floor(rounded);
  const fraction = Math.round((rounded - whole) * 4);
  const fractionText = fraction === 1 ? "1/4" : fraction === 2 ? "1/2" : fraction === 3 ? "3/4" : "";
  if (!fractionText) return String(whole);
  return whole > 0 ? `${whole}と${fractionText}` : fractionText;
}

function getScaledQuantity(ingredient: RecipeIngredient, servings: number, baseServings: number) {
  if (!ingredient.scalable || ingredient.quantityValue === null) return ingredient.quantityText ?? "";
  const scaled = ingredient.quantityValue * servings / baseServings;
  if (["g", "kg", "ml", "L"].includes(ingredient.unit ?? "")) {
    const rounded = Math.round(scaled * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }
  if (["個", "本", "枚", "袋", "パック", "切れ"].includes(ingredient.unit ?? "")) return String(Math.round(scaled * 2) / 2);
  return formatMixedFraction(scaled);
}

function formatIngredientAmount(ingredient: RecipeIngredient, servings: number, baseServings: number) {
  const quantity = getScaledQuantity(ingredient, servings, baseServings);
  if (["大さじ", "小さじ"].includes(ingredient.unit ?? "")) return `${ingredient.unit}${quantity}`;
  return `${quantity}${ingredient.unit ?? ""}`;
}

export default function RecipeDetailClient({ recipe, canonicalUrl }: { recipe: RecipeData; canonicalUrl: string }) {
  const router = useRouter();
  const [servings, setServings] = useState(Math.max(1, Math.round(recipe.baseServings)));
  const [favorite, setFavorite] = useState(recipe.favorite);
  const [actionPending, startTransition] = useTransition();
  const [shareOpen, setShareOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const shareControlRef = useRef<HTMLDivElement>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const maximumServings = Math.max(20, Math.ceil(recipe.baseServings));
  const saveCount = recipe.saveCount + (favorite === recipe.favorite ? 0 : favorite ? 1 : -1);

  function requireLogin() { router.push(`/login?next=${encodeURIComponent(`/recipes/${recipe.id}`)}`); }

  function handleFavorite() {
    const nextFavorite = !favorite;
    setFavorite(nextFavorite);
    startTransition(async () => {
      const result = await toggleFavorite(recipe.id);
      if (!result.ok) {
        setFavorite(!nextFavorite);
        if (result.error === "login_required") requireLogin();
      }
    });
  }

  useEffect(() => {
    if (!shareOpen) return;

    function closeFromOutside(event: PointerEvent) {
      if (!shareControlRef.current?.contains(event.target as Node)) setShareOpen(false);
    }

    function closeWithEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setShareOpen(false);
      shareButtonRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [shareOpen]);

  async function copyLink() {
    try { await navigator.clipboard.writeText(canonicalUrl); setNotice("レシピのURLをコピーしました"); }
    catch { setNotice("URLをコピーできませんでした。ブラウザの設定をご確認ください。"); }
    setShareOpen(false);
  }

  async function shareFromDevice() {
    if (!navigator.share) { await copyLink(); return; }
    try { await navigator.share({ title: recipe.title, text: recipe.description, url: canonicalUrl }); setShareOpen(false); }
    catch (error) { if ((error as DOMException).name !== "AbortError") setNotice("共有を開始できませんでした。"); }
  }

  return (
    <div className="app-shell recipe-detail-shell">
      <SiteHeader />
      <main className="recipe-detail-main" id="top">
        <nav className="breadcrumb" aria-label="パンくずリスト">
          <Link href="/"><FontAwesomeIcon icon={faChevronLeft} /> ホームへ戻る</Link>
          <span aria-hidden="true">/</span>
          <Link href="/recipes">レシピを探す</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{recipe.title}</span>
        </nav>

        <article>
          <section className="detail-hero" aria-labelledby="recipe-detail-title">
            <div className="detail-image-wrap"><RecipeThumbnail imageUrl={recipe.imageUrl} title={recipe.title} imageClassName="detail-image" priority sizes="(max-width: 760px) 100vw, 56vw" /></div>

            <div className="detail-summary">
              <div className="detail-tags" aria-label="レシピのタグ"><span>{recipe.category}</span>{recipe.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              <h1 id="recipe-detail-title">{recipe.title}</h1>
              <p className="detail-lede">{recipe.description}</p>
              <div className="detail-meta" aria-label="レシピ情報">
                <span><FontAwesomeIcon icon={faClock} /> 調理時間 {recipe.cookingTime ? `${recipe.cookingTime}分` : "未設定"}</span>
                <span><FontAwesomeIcon icon={faUserGroup} /> 基準 {recipe.baseServings}人分</span>
                {recipe.calories ? <span><FontAwesomeIcon icon={faFire} /> 1人分 {recipe.calories}kcal</span> : null}
              </div>
              {recipe.ownerUserId ? <Link className="detail-author" href={`/users/${recipe.ownerUserId}`}>
                <BrandMark />
                <span><small>投稿者</small><strong>{recipe.author}</strong></span>
              </Link> : <div className="detail-author"><BrandMark /><span><small>投稿者</small><strong>{recipe.author}</strong></span></div>}
              <div className="detail-actions" aria-label="レシピの操作">
                {recipe.ownerUserId !== recipe.viewerUserId ? <button type="button" disabled={actionPending} className={favorite ? "is-active" : ""} aria-label={favorite ? "保存から外す" : "保存する"} aria-pressed={favorite} onClick={handleFavorite}>
                  <FontAwesomeIcon icon={favorite ? faBookmarkSolid : faBookmarkRegular} /><span>保存</span><strong>{saveCount}</strong>
                </button> : <div className="detail-save-count"><FontAwesomeIcon icon={faBookmarkSolid} /><span>保存数</span><strong>{saveCount}</strong></div>}
                {recipe.visibility === "public" && recipe.status === "published" ? <div className="share-control" ref={shareControlRef}>
                  <button ref={shareButtonRef} type="button" aria-label="共有メニュー" aria-expanded={shareOpen} aria-controls="share-menu" onClick={() => setShareOpen((value) => !value)}><FontAwesomeIcon icon={faShareNodes} /><span>共有</span></button>
                  {shareOpen ? (
                    <div className="share-menu" id="share-menu" aria-label="共有方法">
                      <button type="button" onClick={shareFromDevice}><FontAwesomeIcon icon={faShareNodes} />端末から共有</button>
                      <a href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(canonicalUrl)}`} target="_blank" rel="noreferrer"><FontAwesomeIcon icon={faLine} />LINEで共有</a>
                      <button type="button" onClick={copyLink}><FontAwesomeIcon icon={faLink} />リンクをコピー</button>
                    </div>
                  ) : null}
                </div> : null}
              </div>
              {recipe.ownerUserId && recipe.ownerUserId !== recipe.viewerUserId ? <CopyRecipeButton recipeId={recipe.id} /> : null}
              {notice ? <p className="detail-notice" aria-live="polite">{notice}</p> : null}
            </div>
          </section>

          <div className="recipe-content-grid">
            <section className="ingredients-panel" aria-labelledby="ingredients-title">
              <div className="content-section-head">
                <div><h2 id="ingredients-title">材料</h2><p>{servings}人分</p></div>
                <div className="serving-stepper" aria-label="表示人数を変更">
                  <button type="button" aria-label="人数を1人減らす" disabled={servings === 1} onClick={() => setServings((value) => Math.max(1, value - 1))}><FontAwesomeIcon icon={faMinus} /></button>
                  <output aria-live="polite"><strong>{servings}</strong><span>人分</span></output>
                  <button type="button" aria-label="人数を1人増やす" disabled={servings >= maximumServings} onClick={() => setServings((value) => Math.min(maximumServings, value + 1))}><FontAwesomeIcon icon={faPlus} /></button>
                </div>
              </div>
              <p className="serving-note">人数変更後の分量は調理しやすい目安に丸めています。</p>
              <dl className="ingredient-list">
                {recipe.ingredients.map((ingredient, index) => <Fragment key={ingredient.id}>
                  {ingredient.group && ingredient.group !== recipe.ingredients[index - 1]?.group ? <div className="ingredient-group-label"><dt>{ingredient.group}</dt><dd /></div> : null}
                  <div>
                    <dt>{ingredient.name}{ingredient.note ? <small>{ingredient.note}</small> : null}</dt>
                    <dd>{formatIngredientAmount(ingredient, servings, recipe.baseServings)}</dd>
                  </div>
                </Fragment>)}
              </dl>
            </section>

            <section className="steps-panel" aria-labelledby="steps-title">
              <div className="content-section-head"><div><h2 id="steps-title">作り方</h2><p>全{recipe.steps.length}工程</p></div></div>
              <ol className="step-list">
                {recipe.steps.map((step, index) => <li key={step.id}><span>{index + 1}</span><div><p>{step.instruction}</p>{step.imageUrl ? <Image className="step-detail-image" src={step.imageUrl} alt={`${index + 1}番目の工程写真`} width={960} height={720} sizes="(max-width: 760px) calc(100vw - 5.5rem), 42rem" /> : null}</div></li>)}
              </ol>
            </section>
          </div>

          <section className="recipe-notes" aria-labelledby="notes-title">
            <div><FontAwesomeIcon icon={faTriangleExclamation} /><h2 id="notes-title">アレルギー・注意事項</h2></div>
            <p>{recipe.allergyNotes || "投稿者からの注意事項はありません。"}</p>
          </section>

          <footer className="recipe-record">
            <p>公開日：{recipe.publishedAt ? new Date(recipe.publishedAt).toLocaleDateString("ja-JP") : "未公開"}　更新日：{new Date(recipe.updatedAt).toLocaleDateString("ja-JP")}</p>
            {recipe.ownerUserId !== recipe.viewerUserId ? <ReportButton targetType="recipe" targetId={recipe.id} label="このレシピを通報する" /> : null}
          </footer>
        </article>
      </main>
      <SiteFooter />
      <BottomNav />
    </div>
  );
}
