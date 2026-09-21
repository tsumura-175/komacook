export const RECIPE_UNIT_SUGGESTIONS = [
  "g", "kg", "ml", "L", "大さじ", "小さじ", "カップ", "個", "本", "枚", "袋", "パック", "缶", "合",
] as const;

export function parseRecipeQuantity(value: string) {
  const normalized = value.trim().replace("／", "/");
  const fraction = normalized.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[3]);
    if (!denominator) return null;
    return Number(fraction[1] ?? 0) + Number(fraction[2]) / denominator;
  }
  const numeric = Number(normalized);
  return normalized !== "" && Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

export function moveRecipeRow<T>(rows: readonly T[], from: number, direction: -1 | 1): T[] {
  const to = from + direction;
  if (from < 0 || from >= rows.length || to < 0 || to >= rows.length) return [...rows];
  const next = [...rows];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function savedTimeLabel(value: string | Date) {
  return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
