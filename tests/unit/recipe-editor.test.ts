import { describe, expect, it } from "vitest";
import { moveRecipeRow, parseRecipeQuantity, savedTimeLabel } from "../../lib/recipe-editor";

describe("recipe editor helpers", () => {
  it("整数・小数・帯分数を換算する", () => {
    expect(parseRecipeQuantity("300")).toBe(300);
    expect(parseRecipeQuantity("1.5")).toBe(1.5);
    expect(parseRecipeQuantity("1 1/2")).toBe(1.5);
    expect(parseRecipeQuantity("1／4")).toBe(0.25);
  });

  it("適量などの自由記述と不正な分母を数値扱いしない", () => {
    expect(parseRecipeQuantity("適量")).toBeNull();
    expect(parseRecipeQuantity("1/0")).toBeNull();
    expect(parseRecipeQuantity("")).toBeNull();
  });

  it("行を上下へ移動し、端では順序を変えない", () => {
    expect(moveRecipeRow(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveRecipeRow(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveRecipeRow(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });

  it("保存時刻を日本向けの時分表示にする", () => {
    expect(savedTimeLabel(new Date(2026, 8, 17, 9, 5))).toContain("09:05");
  });
});
