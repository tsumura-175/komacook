# Design — こまクック

こまクック全画面の共通デザインシステム。新しい画面は、このファイルと `app/tokens.css` を先に読み、画面単位で色・フォント・余白・操作部品を変更しない。

## Genre

Playful。親しみやすいが子ども向けには寄せず、料理中にも読み取りやすい実用性を優先する。

## Audience / Use / Tone

- Audience: 31歳前後の主婦・ワーキングママ
- Primary use: レシピを探す、保存する、人数に合わせて分量を確認する
- Tone: やわらかい、実用的、温かい、正確

## Macrostructure family

- App pages: **Workbench**。検索、登録、保存レシピなど次の操作をすぐ選べる構造。
- Content pages: **Split Studio**。料理写真と概要、材料と手順を対応する左右の領域として扱う。狭い画面では1列にする。
- Marketing pages: 将来作成する場合も同じテーマを使い、写真と具体的な機能説明を主役にする。

## Theme

`komacook-warm`。温かいクリームを紙面、コーラルを主操作、葉色を分類・補助操作に使う。大面積の装飾色やグラデーションは使わない。

- Paper: `oklch(0.978 0.018 82)`
- Surface: `oklch(0.995 0.006 82)`
- Ink: `oklch(0.275 0.035 52)`
- Muted ink: `oklch(0.49 0.038 56)`
- Coral accent: `oklch(0.68 0.137 36)`
- Primary action: `oklch(0.56 0.133 34)`
- Secondary accent: `oklch(0.58 0.087 142)`
- Focus: `oklch(0.26 0.12 248)`

## Typography

- Display: M PLUS 1p, weight 700–800, normal style
- Body: M PLUS 1p, weight 400–500
- UI labels: M PLUS 1p, weight 700–800
- Single-family use is intentional。日本語の読みやすさとLINEに親和性のある親しみやすさを優先する。
- 本文は16pxを基準とし、補足情報以外を14px未満にしない。
- 文字サイズは必ず `--text-*` トークンを使用する。

## Spacing

4px基準の `--space-1`〜`--space-16` を使用する。ページ幅は最大72rem、スマートフォンの左右余白は16px。カード内部は20–24px、主要セクション間は40–64pxを基準とする。

## Motion

- 状態変化は `--ease-out`、閉じる操作は `--ease-in`、切り替えは `--ease-in-out`。
- 操作フィードバックは120–200ms。画面全体を繰り返し動かさない。
- `prefers-reduced-motion` では空間移動を停止する。

## Microinteractions stance

- レシピ保存・保存解除・人数変更は即時に画面へ反映する。
- 成功時は見た目の変化をフィードバックとし、不要な成功トーストを出さない。
- hoverはマウス環境だけに適用し、キーボードでは常に明確なフォーカスリングを表示する。
- タッチ対象は44px以上にする。

## CTA voice

- Primary: コーラル塗り、12px角丸、太字、具体的な動詞。
- Secondary: 明るい面＋1px枠、8px角丸、Primaryと同じ文字サイズ・高さ。
- Icon action: Font Awesomeで統一する。

## What pages MUST share

- M PLUS 1pと文字サイズトークン
- クリーム・コーラル・葉色の配色
- 最大72remのコンテンツ幅と16pxのスマホ左右余白
- ヘッダー、フッター、スマホ下部ナビ
- ボタン高さ、角丸、フォーカスリング
- 4px単位の余白

## What pages MAY differ on

- 情報目的に合わせたMacrostructure
- 写真の比率と配置
- セクション数

## Per-page mapping

- `/`: Workbench
- `/recipes`: Workbench（検索条件レール＋結果一覧）
- `/recipes/[id]`: Split Studio
- `/recipes/new`: Workbench（入力フォーム＋保存レール＋登録前確認ダイアログ）
- `/mypage/recipes`: Workbench（分類タブ＋本人用一覧＋保存したレシピ・下書き・ゴミ箱）
- `/mypage`: Workbench（プロフィール概要＋設定導線）
- `/ingredients`: Workbench（材料一覧＋選択レール）
- `/login`・`/forgot-password`・`/reset-password`: Workbench（認証カード）
- `/onboarding`: Workbench（3段階の初回設定）
- `/notices`・`/contact`: Workbench（運営情報・入力フォーム）
- `/settings/[section]`: Workbench（設定ナビ＋編集区画）
- `/admin/[[...section]]`: Workbench（管理ナビ＋状態一覧）

## Exports

実装時の正本は `app/tokens.css`。以下は他環境へ移植する場合の対応形式。

### tokens.css

```css
@import "./app/tokens.css";
```

### Tailwind v4 `@theme`

```css
@theme {
  --color-paper: oklch(0.978 0.018 82);
  --color-surface: oklch(0.995 0.006 82);
  --color-ink: oklch(0.275 0.035 52);
  --color-accent: oklch(0.56 0.133 34);
  --font-display: var(--font-m-plus-1p);
  --font-body: var(--font-m-plus-1p);
  --spacing-sm: 1rem;
  --spacing-md: 1.5rem;
  --spacing-lg: 2rem;
  --text-label: 0.875rem;
  --text-body: 1rem;
  --radius-card: 0.75rem;
  --radius-input: 0.5rem;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### DTCG `tokens.json`

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "color": {
    "paper": { "$value": "oklch(0.978 0.018 82)", "$type": "color" },
    "surface": { "$value": "oklch(0.995 0.006 82)", "$type": "color" },
    "ink": { "$value": "oklch(0.275 0.035 52)", "$type": "color" },
    "accent": { "$value": "oklch(0.56 0.133 34)", "$type": "color" },
    "focus": { "$value": "oklch(0.26 0.12 248)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "M PLUS 1p", "$type": "fontFamily" },
    "body": { "$value": "M PLUS 1p", "$type": "fontFamily" }
  },
  "size": {
    "label": { "$value": "0.875rem", "$type": "dimension" },
    "body": { "$value": "1rem", "$type": "dimension" }
  },
  "space": {
    "sm": { "$value": "1rem", "$type": "dimension" },
    "md": { "$value": "1.5rem", "$type": "dimension" },
    "lg": { "$value": "2rem", "$type": "dimension" }
  }
}
```

### shadcn/ui CSS variables

```css
:root {
  --background: 97.8% 0.018 82;
  --foreground: 27.5% 0.035 52;
  --card: 99.5% 0.006 82;
  --card-foreground: 27.5% 0.035 52;
  --primary: 56% 0.133 34;
  --primary-foreground: 99.8% 0.006 82;
  --secondary: 91% 0.052 138;
  --secondary-foreground: 44% 0.075 142;
  --muted: 87.5% 0.036 74;
  --muted-foreground: 49% 0.038 56;
  --border: 87.5% 0.036 74;
  --input: 87.5% 0.036 74;
  --ring: 26% 0.12 248;
  --radius: 0.75rem;
}
```
