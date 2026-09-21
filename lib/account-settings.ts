import { z } from "zod";

const optionalFamilyCount = z.preprocess(
  (value) => value === "" || value === null || value === undefined ? null : Number(value),
  z.number().int().min(0).max(20).nullable(),
);

export const familySettingsSchema = z.object({
  adults: optionalFamilyCount,
  children: optionalFamilyCount,
  showFamily: z.boolean(),
}).superRefine((value, context) => {
  if (value.showFamily && value.adults === null && value.children === null) {
    context.addIssue({ code: "custom", path: ["showFamily"], message: "公開する家族構成を入力してください。" });
  }
});

export function valuesMatch(value: string, confirmation: string) {
  return value === confirmation;
}

export const GOOGLE_UNLINK_CONFIRMATION = "Google連携を解除";
export const SIGN_OUT_CONFIRMATION = "all-devices";
