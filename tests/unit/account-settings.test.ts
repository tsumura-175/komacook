import { describe, expect, it } from "vitest";
import { familySettingsSchema, GOOGLE_UNLINK_CONFIRMATION, valuesMatch } from "../../lib/account-settings";

describe("account settings", () => {
  it("空欄の家族構成を非公開で保存できる", () => {
    expect(familySettingsSchema.parse({ adults: "", children: "", showFamily: false })).toEqual({ adults: null, children: null, showFamily: false });
  });

  it("公開する場合は少なくとも一方の人数を必要とする", () => {
    expect(familySettingsSchema.safeParse({ adults: "", children: "", showFamily: true }).success).toBe(false);
    expect(familySettingsSchema.safeParse({ adults: "2", children: "0", showFamily: true }).success).toBe(true);
  });

  it("家族人数の範囲を検証する", () => {
    expect(familySettingsSchema.safeParse({ adults: "21", children: "0", showFamily: false }).success).toBe(false);
  });

  it("確認入力は完全一致を必要とする", () => {
    expect(valuesMatch("new@example.com", "new@example.com")).toBe(true);
    expect(valuesMatch("new@example.com", "NEW@example.com")).toBe(false);
    expect(valuesMatch(GOOGLE_UNLINK_CONFIRMATION, "Google連携解除")).toBe(false);
  });
});
