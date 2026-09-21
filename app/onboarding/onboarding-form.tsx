"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { ProfileAvatarField, ProfileAvatarFieldHandle } from "../components/profile-avatar-field";
import { BrandMark } from "../components/site-shell";
import { completeOnboarding } from "./actions";

type Draft = {
  displayName: string;
  servings: string;
  adults: string;
  children: string;
  familyPublic: "private" | "public";
  contactEmail: string;
};

type InitialProfile = Omit<Draft, "contactEmail"> & {
  avatarKind: "preset" | "upload";
  avatarKey: string;
  avatarColor: string;
  avatarUrl: string | null;
};

type Props = { userId: string; initialProfile: InitialProfile; confirmedEmail: string | null };
const subscribeToClient = () => () => {};

export function OnboardingForm(props: Props) {
  const isClient = useSyncExternalStore(subscribeToClient, () => true, () => false);
  if (!isClient) {
    return <main className="onboarding-page"><section className="onboarding-card"><div className="auth-brand"><BrandMark /><span>こまクック</span></div><p className="onboarding-loading">初回設定を読み込んでいます…</p></section></main>;
  }
  return <OnboardingFormClient {...props} />;
}

function OnboardingFormClient({ userId, initialProfile, confirmedEmail }: Props) {
  const router = useRouter();
  const avatarRef = useRef<ProfileAvatarFieldHandle>(null);
  const draftKey = `komacook-onboarding-draft:${userId}`;
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(() => {
    const initial = { ...initialProfile, contactEmail: "" };
    try {
      const saved = window.localStorage.getItem(draftKey);
      return saved ? { ...initial, ...JSON.parse(saved) } : initial;
    } catch {
      window.localStorage.removeItem(draftKey);
      return initial;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [draft, draftKey]);

  function update(key: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("display_name", draft.displayName);
        formData.set("servings", draft.servings);
        formData.set("adults", draft.adults);
        formData.set("children", draft.children);
        formData.set("family_public", draft.familyPublic);
        formData.set("contact_email", draft.contactEmail);
        await avatarRef.current?.appendTo(formData);
        const result = await completeOnboarding(formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (result.confirmationRequired) {
          setConfirmationEmail(draft.contactEmail);
          return;
        }
        window.localStorage.removeItem(draftKey);
        router.push("/");
        router.refresh();
      } catch {
        setError("画像を処理できませんでした。別の画像でもう一度お試しください。");
      }
    });
  }

  if (confirmationEmail) {
    return <main className="onboarding-page"><section className="onboarding-card">
      <div className="auth-brand"><BrandMark /><span>こまクック</span></div>
      <div className="confirmation-panel onboarding-confirmation">
        <h1>確認メールを送信しました</h1>
        <p><strong>{confirmationEmail}</strong> に届いたリンクを開くと、初回設定が完了します。</p>
        <p>確認が終わるまで、通常の会員機能は利用できません。</p>
        <button className="outline-action full-action" type="button" onClick={() => setConfirmationEmail(null)}>メールアドレスを修正する</button>
      </div>
    </section></main>;
  }

  return <main className="onboarding-page"><section className="onboarding-card">
    <div className="auth-brand"><BrandMark /><span>こまクック</span></div>
    <div className="onboarding-progress" aria-label={`初回設定 ${step}/3`}><span className={step >= 1 ? "is-done" : ""} /><span className={step >= 2 ? "is-done" : ""} /><span className={step >= 3 ? "is-done" : ""} /></div>
    <form onSubmit={finish}>
      {step === 1 ? <section className="onboarding-step"><header><span>1 / 3</span><h1>まずは基本設定</h1><p>普段作る人数を登録すると、レシピの分量をすぐ合わせられます。</p></header><label className="form-field"><span>表示名 <b>必須</b></span><input value={draft.displayName} onChange={(event) => update("displayName", event.target.value)} maxLength={30} placeholder="例：こまさん" required /></label><label className="form-field"><span>標準の調理人数 <b>必須</b></span><div className="field-with-unit"><input type="number" min="1" max="20" value={draft.servings} onChange={(event) => update("servings", event.target.value)} required /><span>人分</span></div></label><button className="primary-action full-action" type="button" onClick={() => setStep(2)} disabled={!draft.displayName.trim()}>次へ進む</button></section> : null}
      <section className="onboarding-step" hidden={step !== 2}><header><span>2 / 3</span><h1>家族構成とアイコン</h1><p>家族構成は公開するか選べます。アイコンは後から変更できます。</p></header><div className="family-grid"><label className="form-field"><span>大人</span><div className="field-with-unit"><input type="number" min="0" max="20" value={draft.adults} onChange={(event) => update("adults", event.target.value)} /><span>人</span></div></label><label className="form-field"><span>子ども</span><div className="field-with-unit"><input type="number" min="0" max="20" value={draft.children} onChange={(event) => update("children", event.target.value)} /><span>人</span></div></label></div><fieldset className="visibility-field"><legend>家族構成の公開</legend><label><input type="radio" checked={draft.familyPublic === "private"} onChange={() => update("familyPublic", "private")} /><span><strong>非公開</strong><small>自分だけが確認できます</small></span></label><label><input type="radio" checked={draft.familyPublic === "public"} onChange={() => update("familyPublic", "public")} /><span><strong>公開</strong><small>プロフィールに表示します</small></span></label></fieldset><ProfileAvatarField ref={avatarRef} className="profile-icon-editor onboarding-avatar-editor" initialMode={initialProfile.avatarKind} initialIcon={initialProfile.avatarKey} initialColor={initialProfile.avatarColor} initialImageUrl={initialProfile.avatarUrl} legend="アイコンを選ぶ" /><div className="onboarding-actions"><button className="outline-action" type="button" onClick={() => setStep(1)}>戻る</button><button className="primary-action" type="button" onClick={() => setStep(3)}>次へ進む</button></div></section>
      {step === 3 ? <section className="onboarding-step"><header><span>3 / 3</span><h1>最後に確認</h1><p>{confirmedEmail ? "登録済みのメールアドレスは確認されています。" : "連絡用メールアドレスの確認後に初回設定が完了します。"}</p></header>{confirmedEmail ? <div className="onboarding-email-status"><span>確認済みメールアドレス</span><strong>{confirmedEmail}</strong></div> : <label className="form-field"><span>連絡用メールアドレス <b>必須</b></span><input type="email" value={draft.contactEmail} onChange={(event) => update("contactEmail", event.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>}<label className="agreement-check"><input type="checkbox" required /><span><Link href="/terms">利用規約</Link>、<Link href="/privacy">プライバシーポリシー</Link>、<Link href="/guidelines">投稿ガイドライン</Link>を確認しました。18歳未満の場合は保護者の同意を得ています。</span></label>{error ? <p className="auth-error" role="alert">{error}</p> : null}<div className="onboarding-actions"><button className="outline-action" type="button" onClick={() => setStep(2)} disabled={pending}>戻る</button><button className="primary-action" type="submit" disabled={pending}>{pending ? "保存中…" : "設定を完了する"}</button></div></section> : null}
    </form>
  </section></main>;
}
