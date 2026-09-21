import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";

export default function RecipeNotFound() {
  return <main className="service-error"><div><FontAwesomeIcon icon={faMagnifyingGlass} /><h1>該当のレシピが存在しません</h1><p>削除されたか、URLが正しくない可能性があります。公開レシピ一覧から探してみてください。</p><Link href="/recipes">レシピを探す</Link><Link href="/">ホームへ戻る</Link></div></main>;
}
