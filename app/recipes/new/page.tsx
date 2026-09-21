"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDown, faArrowUp, faCheck, faChevronRight, faClockRotateLeft, faFloppyDisk, faPlus, faRotate, faTrashCan, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { BottomNav, SiteFooter, SiteHeader } from "../../components/site-shell";
import { RecipeDeleteDialog } from "../../components/recipe-delete-dialog";
import { Dialog } from "../../components/dialog";
import { RecipeImageField, type RecipeImageFieldHandle } from "../../components/recipe-image-field";
import { RecipeStepImageField, type RecipeStepImageFieldHandle } from "../../components/recipe-step-image-field";
import { moveRecipeRow, RECIPE_UNIT_SUGGESTIONS, savedTimeLabel } from "../../../lib/recipe-editor";
import { createClient } from "../../../lib/supabase/client";
import { moveRecipeToTrash, saveRecipe, type RecipeInput } from "../actions";

type IngredientRow = { id: number; name: string; quantity: string; unit: string; note: string; group: string };
type StepRow = { id: number; text: string; imagePath: string | null; imageUrl: string | null };
type ChangeState = { revision: number; immediate: boolean };
type SavePhase = "idle" | "saving" | "saved" | "error" | "conflict";
type RecipePreview = RecipeInput & { categoryName: string };
type LocalPublishedDraft = { version: 1; savedAt: string; input: RecipeInput };

type LoadedRecipe = Record<string, unknown> & {
  id: string;
  lock_version: number;
  status: "draft" | "published";
  recipe_ingredients: Array<Record<string, unknown>>;
  recipe_steps: Array<Record<string, unknown>>;
  recipe_tags: Array<{ tags: { name: string } | Array<{ name: string }> | null }>;
};

const initialIngredients: IngredientRow[] = [
  { id: 1, name: "", quantity: "", unit: "g", note: "", group: "" },
  { id: 2, name: "", quantity: "", unit: "個", note: "", group: "" },
];
const initialSteps: StepRow[] = [{ id: 1, text: "", imagePath: null, imageUrl: null }, { id: 2, text: "", imagePath: null, imageUrl: null }];

function localDraftKey(recipeId: string) {
  return `komacook:published-recipe-draft:${recipeId}`;
}

function readLocalPublishedDraft(recipe: LoadedRecipe): LocalPublishedDraft | null {
  try {
    const raw = window.localStorage.getItem(localDraftKey(recipe.id));
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<LocalPublishedDraft>;
    if (draft.version !== 1 || !draft.input || draft.input.id !== recipe.id || draft.input.lockVersion !== Number(recipe.lock_version)) return null;
    return draft as LocalPublishedDraft;
  } catch {
    return null;
  }
}

export default function NewRecipePage({ mode = "new" }: { mode?: "new" | "edit" }) {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const recipeImageRef = useRef<RecipeImageFieldHandle>(null);
  const stepImageRefs = useRef(new Map<number, RecipeStepImageFieldHandle>());
  const nextRowIdRef = useRef(3);
  const savedIdRef = useRef(mode === "edit" ? params.id ?? "" : "");
  const clientIdRef = useRef(mode === "edit" ? params.id ?? "" : "");
  const lockVersionRef = useRef(0);
  const currentStatusRef = useRef<"draft" | "published">("draft");
  const dirtyRef = useRef(false);
  const imageDirtyRef = useRef(false);
  const stepImageDirtyRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);
  const latestRevisionRef = useRef(0);

  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [savedId, setSavedId] = useState(mode === "edit" ? params.id ?? "" : "");
  const [initialRecipe, setInitialRecipe] = useState<LoadedRecipe | Record<string, never> | null>(mode === "edit" ? null : {});
  const [initialImageUrl, setInitialImageUrl] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<IngredientRow[]>(initialIngredients);
  const [steps, setSteps] = useState<StepRow[]>(initialSteps);
  const [changeState, setChangeState] = useState<ChangeState>({ revision: 0, immediate: false });
  const [savePhase, setSavePhase] = useState<SavePhase>("idle");
  const [status, setStatus] = useState("入力内容は最終変更から30秒後に自動保存されます");
  const [preview, setPreview] = useState<RecipePreview | null>(null);
  const [registered, setRegistered] = useState(false);
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const markDirty = useCallback((immediate = false) => {
    dirtyRef.current = true;
    setSavePhase("idle");
    setStatus("未保存の変更があります");
    setChangeState((current) => {
      const next = { revision: current.revision + 1, immediate };
      latestRevisionRef.current = next.revision;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!clientIdRef.current) clientIdRef.current = crypto.randomUUID();
    const supabase = createClient();
    let cancelled = false;
    async function loadFormData() {
      const categoryRequest = supabase.from("categories").select("id, name").eq("is_active", true).order("sort_order");
      const { data: authData } = mode === "edit" ? await supabase.auth.getUser() : { data: { user: null } };
      const recipeRequest = mode === "edit" && params.id && authData.user
        ? supabase.from("recipes").select("*, recipe_ingredients(*), recipe_steps(*), recipe_tags(tags(name))").eq("id", params.id).eq("owner_user_id", authData.user.id).single()
        : Promise.resolve({ data: null, error: null });
      const [categoryResult, recipeResult] = await Promise.all([categoryRequest, recipeRequest]);
      if (cancelled) return;
      setCategories(categoryResult.data ?? []);
      if (mode !== "edit") return;
      if (recipeResult.error || !recipeResult.data) {
        router.replace("/mypage/recipes");
        return;
      }
      const recipe = recipeResult.data as LoadedRecipe;
      savedIdRef.current = recipe.id;
      clientIdRef.current = recipe.id;
      lockVersionRef.current = Number(recipe.lock_version ?? 1);
      currentStatusRef.current = recipe.status;
      setSavedId(recipe.id);
      const localDraft = recipe.status === "published" ? readLocalPublishedDraft(recipe) : null;
      const displayedRecipe = localDraft ? {
        ...recipe,
        title: localDraft.input.title,
        description: localDraft.input.description,
        base_servings: localDraft.input.servings,
        category_id: localDraft.input.categoryId,
        cooking_time_minutes: localDraft.input.time,
        calories_per_serving: localDraft.input.calories,
        visibility: localDraft.input.visibility,
        allergy_notes: localDraft.input.allergy,
        recipe_tags: localDraft.input.tags.split(/[、,]/).map((name) => ({ tags: { name: name.trim() } })).filter((item) => item.tags.name),
      } : recipe;
      const displayedIngredients: IngredientRow[] = localDraft
        ? localDraft.input.ingredients.map((item) => ({ id: nextRowIdRef.current++, ...item }))
        : recipe.recipe_ingredients.toSorted((a, b) => Number(a.sort_order) - Number(b.sort_order)).map((item) => ({
          id: nextRowIdRef.current++, name: String(item.name), quantity: String(item.quantity_display ?? item.quantity_text ?? item.quantity_value ?? ""), unit: String(item.unit ?? ""), note: String(item.note ?? ""), group: String(item.group_name ?? ""),
        }));
      const displayedSteps: StepRow[] = localDraft
        ? localDraft.input.steps.map((step) => ({ id: nextRowIdRef.current++, text: step.instruction, imagePath: step.imagePath ?? null, imageUrl: null }))
        : recipe.recipe_steps.toSorted((a, b) => Number(a.sort_order) - Number(b.sort_order)).map((item) => ({ id: nextRowIdRef.current++, text: String(item.instruction), imagePath: typeof item.image_path === "string" ? item.image_path : null, imageUrl: null }));
      const stepImagePaths = displayedSteps.flatMap((step) => step.imagePath ? [step.imagePath] : []);
      if (stepImagePaths.length) {
        const { data: signed } = await supabase.storage.from("recipe-images").createSignedUrls(stepImagePaths, 3600);
        const urls = new Map((signed ?? []).map((item) => [item.path, item.signedUrl]));
        displayedSteps.forEach((step) => { if (step.imagePath) step.imageUrl = urls.get(step.imagePath) ?? null; });
      }
      setIngredients(displayedIngredients.length ? displayedIngredients : [{ id: nextRowIdRef.current++, name: "", quantity: "", unit: "g", note: "", group: "" }]);
      setSteps(displayedSteps.length ? displayedSteps : [{ id: nextRowIdRef.current++, text: "", imagePath: null, imageUrl: null }]);
      if (typeof recipe.image_path === "string" && recipe.image_path) {
        const { data: imageData } = await supabase.storage.from("recipe-images").createSignedUrl(recipe.image_path, 3600);
        if (!cancelled) setInitialImageUrl(imageData?.signedUrl ?? null);
      }
      if (!cancelled) {
        setInitialRecipe(displayedRecipe);
        setSavePhase("saved");
        setStatus(localDraft ? `この端末の編集内容を復元しました ${savedTimeLabel(localDraft.savedAt)}` : `保存済み ${savedTimeLabel(String(recipe.updated_at))}`);
      }
    }
    void loadFormData();
    return () => { cancelled = true; };
  }, [mode, params.id, router]);

  function updateIngredient(id: number, key: keyof Omit<IngredientRow, "id">, value: string) {
    setIngredients((rows) => rows.map((row) => row.id === id ? { ...row, [key]: value } : row));
  }

  const buildInput = useCallback((form: HTMLFormElement): RecipeInput => {
    const values = new FormData(form);
    return {
      id: savedIdRef.current || undefined,
      clientId: clientIdRef.current,
      lockVersion: lockVersionRef.current,
      currentStatus: currentStatusRef.current,
      title: String(values.get("title") ?? ""), description: String(values.get("description") ?? ""),
      servings: String(values.get("servings") ?? "2"), categoryId: String(values.get("category") ?? ""),
      time: String(values.get("time") ?? ""), calories: String(values.get("calories") ?? ""), tags: String(values.get("tags") ?? ""),
      visibility: values.get("visibility") === "public" ? "public" : "private", allergy: String(values.get("allergy") ?? ""),
      ingredients: ingredients.filter((row) => row.name.trim() && row.quantity.trim()).map(({ name, quantity, unit, note, group }) => ({ name, quantity, unit, note, group })),
      steps: steps.filter((row) => row.text.trim()).map((row) => ({ clientId: row.id, instruction: row.text.trim(), imagePath: row.imagePath })),
    };
  }, [ingredients, steps]);

  const persist = useCallback(async (intent: "autosave" | "draft" | "publish", input?: RecipeInput, revision = latestRevisionRef.current) => {
    if (!formRef.current || conflictOpen) return false;
    if (saveInFlightRef.current) {
      saveQueuedRef.current = true;
      return false;
    }
    saveInFlightRef.current = true;
    setSaving(true);
    setSavePhase("saving");
    setStatus(intent === "autosave" ? "自動保存中…" : "保存中…");
    const payload = new FormData(formRef.current);
    const recipeInput = input ?? buildInput(formRef.current);
    try {
      if (intent === "autosave" && recipeInput.id && recipeInput.currentStatus === "published") {
        const savedAt = new Date().toISOString();
        const localDraft: LocalPublishedDraft = { version: 1, savedAt, input: recipeInput };
        window.localStorage.setItem(localDraftKey(recipeInput.id), JSON.stringify(localDraft));
        if (revision === latestRevisionRef.current && !imageDirtyRef.current && !stepImageDirtyRef.current) dirtyRef.current = false;
        setSavePhase(imageDirtyRef.current || stepImageDirtyRef.current ? "idle" : "saved");
        setStatus(imageDirtyRef.current || stepImageDirtyRef.current
          ? `文字はこの端末に保存済み ${savedTimeLabel(savedAt)}（写真は確認後に保存）`
          : `この端末に自動保存済み ${savedTimeLabel(savedAt)}（公開内容は未変更）`);
        return true;
      }
      // フィールド自身が未変更なら何もしない。親側の表示状態に依存させない。
      await recipeImageRef.current?.stageSource(payload);
      await Promise.all([...stepImageRefs.current.values()].map((field) => field.stageSource(payload)));
      const result = await saveRecipe(recipeInput, intent, payload);
      if (result.id) { savedIdRef.current = result.id; setSavedId(result.id); }
      if (typeof result.lockVersion === "number") lockVersionRef.current = result.lockVersion;
      if (!result.ok) {
        if (result.code === "conflict") { setSavePhase("conflict"); setConflictOpen(true); } else setSavePhase("error");
        setStatus(result.error ?? "保存できませんでした。入力内容は保持しています。");
        return false;
      }
      if (result.stepImagePaths) setSteps((rows) => rows.map((step) => ({ ...step, imagePath: result.stepImagePaths![String(step.id)] ?? null })));
      recipeImageRef.current?.markPersisted();
      stepImageRefs.current.forEach((field) => field.markPersisted());
      imageDirtyRef.current = false;
      stepImageDirtyRef.current = false;
      if (intent === "draft" || (!recipeInput.id && intent === "autosave")) currentStatusRef.current = "draft";
      if (intent === "publish") currentStatusRef.current = "published";
      if (intent === "publish" && result.id) window.localStorage.removeItem(localDraftKey(result.id));
      if (revision === latestRevisionRef.current) dirtyRef.current = false;
      setSavePhase("saved");
      setStatus(`保存済み ${savedTimeLabel(result.savedAt ?? new Date())}`);
      if (intent === "publish") { setRegistered(true); router.refresh(); }
      return true;
    } catch (error) {
      setSavePhase("error");
      setStatus(error instanceof Error ? error.message : "保存できませんでした。入力内容は保持しています。");
      return false;
    } finally {
      await recipeImageRef.current?.discardStagedSource();
      await Promise.all([...stepImageRefs.current.values()].map((field) => field.discardStagedSource()));
      saveInFlightRef.current = false;
      setSaving(false);
      if (saveQueuedRef.current) {
        saveQueuedRef.current = false;
        setChangeState((current) => {
          const next = { revision: current.revision + 1, immediate: true };
          latestRevisionRef.current = next.revision;
          return next;
        });
      }
    }
  }, [buildInput, conflictOpen, router]);

  useEffect(() => {
    if (!initialRecipe || !dirtyRef.current || conflictOpen || preview) return;
    const timer = window.setTimeout(() => { void persist("autosave", undefined, changeState.revision); }, changeState.immediate ? 0 : 30000);
    return () => window.clearTimeout(timer);
  }, [changeState, conflictOpen, initialRecipe, persist, preview]);

  useEffect(() => {
    function saveBeforeLeaving() { if (document.visibilityState === "hidden" && dirtyRef.current && !saveInFlightRef.current) void persist("autosave"); }
    function warnBeforeLeaving(event: BeforeUnloadEvent) { if (dirtyRef.current) event.preventDefault(); }
    document.addEventListener("visibilitychange", saveBeforeLeaving);
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => { document.removeEventListener("visibilitychange", saveBeforeLeaving); window.removeEventListener("beforeunload", warnBeforeLeaving); };
  }, [persist]);

  function addIngredient() {
    setIngredients((rows) => [...rows, { id: nextRowIdRef.current++, name: "", quantity: "", unit: "g", note: "", group: "" }]);
    markDirty(true);
  }
  function addStep() { setSteps((rows) => [...rows, { id: nextRowIdRef.current++, text: "", imagePath: null, imageUrl: null }]); markDirty(true); }

  function submitRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = buildInput(event.currentTarget);
    if (!input.title.trim() || !input.categoryId || !input.ingredients.length || !input.steps.length) {
      setSavePhase("error"); setStatus("レシピ名、カテゴリ、材料、作り方を確認してください"); return;
    }
    setRegistered(false);
    setPreview({ ...input, categoryName: categories.find((category) => category.id === input.categoryId)?.name ?? "未選択" });
    setStatus("入力内容を確認中です");
  }

  const saveStatusIcon = savePhase === "saved" ? faCheck : savePhase === "error" || savePhase === "conflict" ? faTriangleExclamation : savePhase === "saving" ? faRotate : faFloppyDisk;

  return <div className="app-shell member-page-shell">
    <SiteHeader />
    <main className="member-page-main recipe-editor-main">
      <header className="member-page-heading"><div><h1>{mode === "edit" ? "レシピを編集" : "レシピを登録"}</h1><p>{mode === "edit" ? "分量や手順を見直して、いつもの味を更新します。" : "作った味を、次も同じように作れる形で残します。"}</p></div></header>
      {initialRecipe === null ? <p className="search-page-loading">レシピを読み込んでいます</p> : <form ref={formRef} className="recipe-editor-layout" onInput={() => markDirty(false)} onSubmit={submitRecipe}>
        <div className="editor-sections">
          <section className="form-panel" aria-labelledby="basic-title">
            <div className="form-panel-heading"><span>1</span><div><h2 id="basic-title">基本情報</h2><p>料理名や基準人数を入力します。</p></div></div>
            <div className="form-grid">
              <label className="form-field form-field-wide"><span>レシピ名 <b>必須</b></span><input name="title" required maxLength={100} defaultValue={String(initialRecipe.title ?? "")} placeholder="例：豚肉と玉ねぎの甘辛炒め" /></label>
              <label className="form-field form-field-wide"><span>説明・自分用メモ</span><textarea name="description" rows={3} maxLength={3000} defaultValue={String(initialRecipe.description ?? "")} placeholder="家族の反応や、次回変えたいことも残せます" /></label>
              <label className="form-field"><span>基準人数 <b>必須</b></span><div className="field-with-unit"><input name="servings" type="number" min="1" max="100" step="0.5" defaultValue={String(initialRecipe.base_servings ?? "2")} required /><span>人分</span></div></label>
              <label className="form-field"><span>カテゴリ <b>必須</b></span><select name="category" required defaultValue={String(initialRecipe.category_id ?? "")}><option value="" disabled>選択してください</option>{categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
              <label className="form-field"><span>調理時間</span><div className="field-with-unit"><input name="time" type="number" min="1" max="1440" defaultValue={String(initialRecipe.cooking_time_minutes ?? "")} placeholder="20" /><span>分</span></div></label>
              <label className="form-field"><span>1人前の概算カロリー</span><div className="field-with-unit"><input name="calories" type="number" min="0" max="10000" defaultValue={String(initialRecipe.calories_per_serving ?? "")} placeholder="350" /><span>kcal</span></div></label>
              <label className="form-field form-field-wide"><span>タグ</span><input name="tags" defaultValue={"recipe_tags" in initialRecipe ? initialRecipe.recipe_tags.flatMap((item) => Array.isArray(item.tags) ? item.tags.map((tag) => tag.name) : item.tags?.name ? [item.tags.name] : []).join("、") : ""} placeholder="時短、作り置き、ごはんが進む（最大10個）" /><small>タグ同士は読点またはカンマで区切ります。</small></label>
            </div>
            <fieldset className="visibility-field"><legend>公開範囲 <b>必須</b></legend><label><input type="radio" name="visibility" value="private" defaultChecked={initialRecipe.visibility !== "public"} /><span><strong>非公開</strong><small>自分だけが見られます</small></span></label><label><input type="radio" name="visibility" value="public" disabled={initialRecipe.source_type === "copied"} defaultChecked={initialRecipe.visibility === "public"} /><span><strong>公開</strong><small>{initialRecipe.source_type === "copied" ? "他者レシピのコピーは公開できません" : "検索結果やGoogle検索に表示されます"}</small></span></label></fieldset>
          </section>
          <section className="form-panel" aria-labelledby="ingredients-form-title">
            <div className="form-panel-heading"><span>2</span><div><h2 id="ingredients-form-title">材料</h2><p>グループ分け、自由な単位、上下の並べ替えに対応しています。</p></div></div>
            <datalist id="recipe-unit-suggestions">{RECIPE_UNIT_SUGGESTIONS.map((unit) => <option value={unit} key={unit} />)}</datalist>
            <div className="dynamic-list">{ingredients.map((row, index) => <div className="ingredient-form-row" key={row.id}>
              <span className="row-number">{index + 1}</span>
              <label><span>グループ</span><input value={row.group} maxLength={50} onChange={(event) => updateIngredient(row.id, "group", event.target.value)} placeholder="例：たれ" /></label>
              <label><span>材料名</span><input value={row.name} maxLength={100} onChange={(event) => updateIngredient(row.id, "name", event.target.value)} placeholder="例：豚こま切れ肉" /></label>
              <label><span>分量</span><input value={row.quantity} maxLength={30} onChange={(event) => updateIngredient(row.id, "quantity", event.target.value)} placeholder="300、1/2、適量" /></label>
              <label><span>単位</span><input list="recipe-unit-suggestions" value={row.unit} maxLength={30} onChange={(event) => updateIngredient(row.id, "unit", event.target.value)} placeholder="自由入力可" /></label>
              <label><span>補足</span><input value={row.note} maxLength={200} onChange={(event) => updateIngredient(row.id, "note", event.target.value)} placeholder="お好みで" /></label>
              <div className="row-actions" aria-label={`${index + 1}番目の材料の操作`}>
                <button type="button" aria-label={`${index + 1}番目の材料を上へ移動`} disabled={index === 0} onClick={() => { setIngredients((rows) => moveRecipeRow(rows, index, -1)); markDirty(true); }}><FontAwesomeIcon icon={faArrowUp} /></button>
                <button type="button" aria-label={`${index + 1}番目の材料を下へ移動`} disabled={index === ingredients.length - 1} onClick={() => { setIngredients((rows) => moveRecipeRow(rows, index, 1)); markDirty(true); }}><FontAwesomeIcon icon={faArrowDown} /></button>
                <button type="button" aria-label={`${index + 1}番目の材料を削除`} disabled={ingredients.length === 1} onClick={() => { setIngredients((rows) => rows.filter((item) => item.id !== row.id)); markDirty(true); }}><FontAwesomeIcon icon={faTrashCan} /></button>
              </div>
            </div>)}</div>
            <button className="add-row-button" type="button" onClick={addIngredient}><FontAwesomeIcon icon={faPlus} />材料を追加</button>
          </section>
          <section className="form-panel" aria-labelledby="steps-form-title">
            <div className="form-panel-heading"><span>3</span><div><h2 id="steps-form-title">作り方</h2><p>工程ごとに写真を1枚追加でき、上下ボタンで並べ替えられます。</p></div></div>
            <div className="dynamic-list">{steps.map((step, index) => <div className="step-form-row" key={step.id}>
              <span className="row-number">{index + 1}</span><label><span className="sr-only">工程{index + 1}</span><textarea rows={3} maxLength={2000} value={step.text} onChange={(event) => setSteps((rows) => rows.map((item) => item.id === step.id ? { ...item, text: event.target.value } : item))} placeholder="材料を切る、炒めるなどの手順を入力" /></label>
              <RecipeStepImageField rowId={step.id} initialImageUrl={step.imageUrl} ref={(field) => { if (field) stepImageRefs.current.set(step.id, field); else stepImageRefs.current.delete(step.id); }} onChange={() => { stepImageDirtyRef.current = true; markDirty(true); }} />
              <div className="row-actions" aria-label={`${index + 1}番目の工程の操作`}>
                <button type="button" aria-label={`${index + 1}番目の工程を上へ移動`} disabled={index === 0} onClick={() => { setSteps((rows) => moveRecipeRow(rows, index, -1)); markDirty(true); }}><FontAwesomeIcon icon={faArrowUp} /></button>
                <button type="button" aria-label={`${index + 1}番目の工程を下へ移動`} disabled={index === steps.length - 1} onClick={() => { setSteps((rows) => moveRecipeRow(rows, index, 1)); markDirty(true); }}><FontAwesomeIcon icon={faArrowDown} /></button>
                <button type="button" aria-label={`${index + 1}番目の工程を削除`} disabled={steps.length === 1} onClick={() => { stepImageDirtyRef.current ||= Boolean(step.imagePath); stepImageRefs.current.delete(step.id); setSteps((rows) => rows.filter((item) => item.id !== step.id)); markDirty(true); }}><FontAwesomeIcon icon={faTrashCan} /></button>
              </div>
            </div>)}</div>
            <button className="add-row-button" type="button" onClick={addStep}><FontAwesomeIcon icon={faPlus} />工程を追加</button>
          </section>
          <section className="form-panel" aria-labelledby="notes-form-title">
            <div className="form-panel-heading"><span>4</span><div><h2 id="notes-form-title">完成写真・注意事項</h2><p>料理の完成写真を1枚登録できます。</p></div></div>
            <RecipeImageField ref={recipeImageRef} initialImageUrl={initialImageUrl} onChange={() => { imageDirtyRef.current = true; markDirty(true); }} />
            <label className="form-field"><span>アレルギー・注意事項</span><textarea name="allergy" rows={3} maxLength={2000} defaultValue={String(initialRecipe.allergy_notes ?? "")} placeholder="例：しょうゆには大豆・小麦が含まれます" /></label>
          </section>
        </div>
        <aside className="editor-save-panel">
          <div className={`save-status is-${savePhase}`}><FontAwesomeIcon icon={saveStatusIcon} spin={savePhase === "saving"} /><span><strong>下書き保存</strong><small aria-live="polite">{status}</small></span></div>
          <div className="editor-summary"><p><span>自動保存</span><strong>変更後30秒</strong></p><p><span>競合防止</span><strong>有効</strong></p></div>
          <button className="outline-action full-action" type="button" disabled={saving} onClick={() => { if (formRef.current) void persist(currentStatusRef.current === "published" ? "autosave" : "draft", buildInput(formRef.current)); }}>{saving ? "保存中…" : initialRecipe.status === "published" ? "今すぐ端末に保存" : "今すぐ下書き保存"}</button>
          <button className="primary-action full-action" type="submit" disabled={saving}>{mode === "edit" ? "変更内容を確認" : "入力内容を確認"} <FontAwesomeIcon icon={faChevronRight} /></button>
          {mode === "edit" && savedId ? <button className="outline-action full-action" type="button" disabled={saving} onClick={() => setTrashConfirmOpen(true)}><FontAwesomeIcon icon={faTrashCan} />ゴミ箱に移す</button> : null}
        </aside>
      </form>}
    </main>
    <Dialog open={Boolean(preview)} titleId="recipe-confirm-title" className="recipe-confirm-dialog" pending={saving} onClose={() => setPreview(null)} closeLabel="確認画面を閉じる">
      {preview ? (registered ? <div className="recipe-register-complete"><span><FontAwesomeIcon icon={faCheck} /></span><h2 id="recipe-confirm-title">レシピを保存しました</h2><p>マイレシピから、いつでも分量や手順を編集できます。</p><Link className="primary-action full-action" href="/mypage/recipes">マイレシピを見る</Link></div> : <>
        <h2 id="recipe-confirm-title">保存内容を確認</h2><p>材料の順序と公開範囲を含め、保存前に最終確認してください。</p>
        <dl className="recipe-confirm-summary"><div><dt>レシピ名</dt><dd>{preview.title}</dd></div><div><dt>カテゴリ</dt><dd>{preview.categoryName}</dd></div><div><dt>基準人数</dt><dd>{preview.servings}人分</dd></div><div><dt>公開範囲</dt><dd>{preview.visibility === "public" ? "公開" : "非公開"}</dd></div>{preview.time ? <div><dt>調理時間</dt><dd>{preview.time}分</dd></div> : null}{preview.calories ? <div><dt>概算カロリー</dt><dd>{preview.calories}kcal／1人前</dd></div> : null}</dl>
        {preview.description ? <div className="recipe-confirm-block"><h3>説明・メモ</h3><p>{preview.description}</p></div> : null}
        <div className="recipe-confirm-block"><h3>材料</h3><ul>{preview.ingredients.map((row, index) => <li key={`${row.name}-${index}`}><span>{row.group ? <small>{row.group}</small> : null}{row.name}{row.note ? <em>（{row.note}）</em> : null}</span><strong>{row.quantity}{row.unit}</strong></li>)}</ul></div>
        <div className="recipe-confirm-block"><h3>作り方</h3><ol>{preview.steps.map((step, index) => <li key={`${step.instruction}-${index}`}>{step.instruction}</li>)}</ol></div>
        {preview.tags ? <div className="recipe-confirm-block"><h3>タグ</h3><p>{preview.tags}</p></div> : null}{preview.allergy ? <div className="recipe-confirm-block"><h3>アレルギー・注意事項</h3><p>{preview.allergy}</p></div> : null}
        <div className="report-actions"><button className="outline-action" type="button" disabled={saving} onClick={() => setPreview(null)}>入力画面に戻る</button><button className="primary-action" type="button" disabled={saving} onClick={() => void persist("publish", preview)}>{saving ? "保存中…" : mode === "edit" ? "変更を保存" : "この内容で登録"}</button></div>
      </>) : null}
    </Dialog>
    <Dialog open={conflictOpen} titleId="recipe-conflict-title" className="recipe-conflict-dialog" role="alertdialog">
      <span className="recipe-conflict-icon"><FontAwesomeIcon icon={faClockRotateLeft} /></span><h2 id="recipe-conflict-title">別の画面で更新されています</h2><p>この画面の入力内容は消していません。最新の内容を読み込むと、この画面の未保存内容は破棄されます。</p>
      <div className="report-actions"><button className="outline-action" type="button" onClick={() => setConflictOpen(false)}>入力内容を確認する</button><button className="primary-action" type="button" onClick={() => window.location.reload()}><FontAwesomeIcon icon={faRotate} />最新内容を読み込む</button></div>
    </Dialog>
    <RecipeDeleteDialog open={trashConfirmOpen} title="このレシピをゴミ箱へ移しますか？" description="30日間はゴミ箱から元に戻せます。期限を過ぎると完成写真を含めて自動的に完全削除されます。" confirmLabel="ゴミ箱へ移す" pending={saving} onClose={() => setTrashConfirmOpen(false)} onConfirm={() => { setSaving(true); void moveRecipeToTrash(savedId).then((result) => { if (result.ok) router.push("/mypage/recipes?tab=trash"); else { setTrashConfirmOpen(false); setSavePhase("error"); setStatus(result.error ?? "ゴミ箱へ移せませんでした"); setSaving(false); } }); }} />
    <SiteFooter /><BottomNav />
  </div>;
}
