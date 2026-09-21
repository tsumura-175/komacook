"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight, faMagnifyingGlass, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BottomNav, SiteFooter, SiteHeader } from "../components/site-shell";

const groups = [
  { name: "肉・魚", items: ["鶏肉", "豚肉", "牛肉", "ひき肉", "鮭", "さば", "ツナ"] },
  { name: "野菜", items: ["キャベツ", "玉ねぎ", "にんじん", "じゃがいも", "なす", "ピーマン", "トマト", "きのこ"] },
  { name: "卵・大豆・乳製品", items: ["たまご", "豆腐", "納豆", "油揚げ", "牛乳", "チーズ", "ヨーグルト"] },
  { name: "主食・その他", items: ["ごはん", "うどん", "パスタ", "パン", "もやし", "わかめ", "こんにゃく"] },
];

export default function IngredientsPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const visibleGroups = useMemo(() => groups.map((group) => ({ ...group, items: group.items.filter((item) => item.includes(query.trim())) })).filter((group) => group.items.length), [query]);

  function toggleIngredient(item: string) {
    setSelected((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);
  }

  function searchRecipes() {
    if (!selected.length) return;
    router.push(`/recipes?q=${encodeURIComponent(selected.join(" "))}`);
  }

  return (
    <div className="app-shell member-page-shell">
      <SiteHeader />
      <main className="member-page-main ingredients-page-main">
        <header className="member-page-heading"><div><h1>材料から探す</h1><p>冷蔵庫にある材料を選んで、作れるレシピを探します。</p></div></header>

        <div className="ingredient-finder-tools">
          <label className="compact-search"><FontAwesomeIcon icon={faMagnifyingGlass} /><span className="sr-only">材料を検索</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="材料名を入力" /></label>
          <button type="button" onClick={() => { setQuery(""); setSelected([]); }}><FontAwesomeIcon icon={faRotateLeft} />選択をクリア</button>
        </div>

        <div className="ingredient-finder-layout">
          <section className="ingredient-groups" aria-label="材料一覧">
            {visibleGroups.map((group) => <section className="ingredient-group" key={group.name}><h2>{group.name}</h2><div>{group.items.map((item) => <button type="button" className={selected.includes(item) ? "is-selected" : ""} aria-pressed={selected.includes(item)} onClick={() => toggleIngredient(item)} key={item}>{item}</button>)}</div></section>)}
            {!visibleGroups.length ? <div className="member-empty"><p>該当する材料がありません。</p><button type="button" onClick={() => setQuery("")}>検索をクリア</button></div> : null}
          </section>

          <aside className="selected-ingredients">
            <div><h2>選んだ材料</h2><span>{selected.length}個</span></div>
            {selected.length ? <ul>{selected.map((item) => <li key={item}><span>{item}</span><button type="button" aria-label={`${item}の選択を外す`} onClick={() => toggleIngredient(item)}>×</button></li>)}</ul> : <p>材料を選ぶと、ここに表示されます。</p>}
            <button className="primary-action full-action" type="button" disabled={!selected.length} onClick={searchRecipes}>選んだ材料で探す <FontAwesomeIcon icon={faChevronRight} /></button>
          </aside>
        </div>
      </main>
      <SiteFooter />
      <BottomNav />
    </div>
  );
}
