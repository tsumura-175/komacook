import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookmark as faBookmarkRegular } from "@fortawesome/free-regular-svg-icons";
import { faBookmark, faClock, faCopy, faFloppyDisk, faGlobe, faLock, faPenToSquare, faRotateLeft, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import type { MyRecipe, MyRecipeTab } from "../../lib/my-recipe-types";
import { RecipeThumbnail } from "./recipe-thumbnail";

type Props = { recipe: MyRecipe; activeTab: MyRecipeTab; isSaved: boolean; isSavePending: boolean; priority: boolean; pending: boolean; onRestore(id: string): void; onDelete(recipe: MyRecipe): void; onToggleSaved(id: string): void; };

export function MyRecipeCard({ recipe, activeTab, isSaved, isSavePending, priority, pending, onRestore, onDelete, onToggleSaved }: Props) {
  const sourceLabel = recipe.tab === "favorites" && !isSaved ? "保存解除済み" : recipe.source;
  const sourceIcon = recipe.source === "手入力" ? faPenToSquare : recipe.source === "コピー" ? faCopy : recipe.source === "保存済み" ? isSaved ? faBookmark : faBookmarkRegular : recipe.source === "削除済み" ? faTrashCan : faFloppyDisk;
  return <article className={`my-recipe-card ${recipe.tab === "favorites" && !isSaved ? "is-save-removed" : ""}`}>
    <div className="my-recipe-image"><RecipeThumbnail imageUrl={recipe.imageUrl} title={recipe.name} priority={priority} sizes="(max-width: 600px) 100vw, (max-width: 960px) 50vw, 33vw" /></div>
    <div className="my-recipe-body"><div className="my-recipe-badges"><span><FontAwesomeIcon icon={sourceIcon} />{sourceLabel}</span><span><FontAwesomeIcon icon={recipe.visibility === "公開" ? faGlobe : faLock} />{recipe.visibility}</span></div><h3>{recipe.name}</h3><div className="recipe-tags">{recipe.tags.map((tag) => <span className="recipe-tag" key={tag}>{tag}</span>)}</div><div className="my-recipe-meta"><span><FontAwesomeIcon icon={faClock} />{recipe.time}分</span><span>{activeTab === "trash" ? `完全削除まで：${recipe.updatedLabel}` : `更新：${recipe.updatedLabel}`}</span></div><div className="my-recipe-actions">{activeTab === "trash" ? <><button className="secondary-button" type="button" disabled={pending} onClick={() => onRestore(recipe.id)}><FontAwesomeIcon icon={faRotateLeft} />元に戻す</button><button className="outline-icon-button" type="button" disabled={pending} aria-label={`${recipe.name}を完全に削除`} onClick={() => onDelete(recipe)}><FontAwesomeIcon icon={faTrashCan} /></button></> : <><Link className="secondary-button" href={activeTab === "drafts" ? `/recipes/${recipe.id}/edit` : `/recipes/${recipe.id}`}>{activeTab === "drafts" ? "編集を続ける" : "レシピを見る"}</Link>{activeTab === "favorites" ? <button className={`save-button ${isSaved ? "is-saved" : ""}`} type="button" aria-label={isSaved ? `${recipe.name}を保存から外す` : `${recipe.name}をもう一度保存する`} aria-pressed={isSaved} disabled={isSavePending} onClick={() => onToggleSaved(recipe.id)}><FontAwesomeIcon icon={isSaved ? faBookmark : faBookmarkRegular} /></button> : <Link className="outline-icon-button" href={`/recipes/${recipe.id}/edit`} aria-label={`${recipe.name}を編集`}><FontAwesomeIcon icon={faPenToSquare} /></Link>}</>}</div>{recipe.tab === "favorites" && !isSaved ? <p className="save-removal-note" role="status">画面を移動すると、この一覧から外れます。</p> : null}</div>
  </article>;
}
