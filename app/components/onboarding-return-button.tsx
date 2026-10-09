"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { useRouter } from "next/navigation";

/** 初回設定から別タブで開いた規約ページを、元の設定画面へ戻す。 */
export function OnboardingReturnButton() {
  const router = useRouter();

  function returnToOnboarding() {
    // target=_blank で開いたタブは閉じられる。ブラウザが閉じる操作を拒否した
    // 場合にも、同じ最終確認画面へ遷移できるようにしている。
    window.close();
    window.setTimeout(() => {
      router.push("/onboarding?step=3");
    }, 200);
  }

  return <section className="onboarding-return" aria-label="初回設定へ戻る">
    <button type="button" onClick={returnToOnboarding}><FontAwesomeIcon icon={faArrowLeft} />初回設定に戻る</button>
  </section>;
}
