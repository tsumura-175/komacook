import type { ZxcvbnFactory } from "@zxcvbn-ts/core";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_MIN_CHARACTER_TYPES = 3;
const PASSWORD_SYMBOLS = new Set(Array.from("!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~"));

export type PasswordStrength = {
  label: "弱い" | "もう少し" | "強い" | "とても強い";
  level: 1 | 2 | 3 | 4;
  acceptable: boolean;
  validationMessage: string;
};

let factoryPromise: Promise<ZxcvbnFactory> | undefined;

async function getFactory() {
  factoryPromise ??= Promise.all([
    import("@zxcvbn-ts/core"),
    import("@zxcvbn-ts/language-common"),
    import("@zxcvbn-ts/language-en"),
  ]).then(([core, common, english]) => new core.ZxcvbnFactory({
    translations: english.translations,
    graphs: common.adjacencyGraphs,
    dictionary: { ...common.dictionary, ...english.dictionary },
    maxLength: PASSWORD_MAX_LENGTH,
  }));
  return factoryPromise;
}

export function countPasswordCharacterTypes(password: string) {
  return [/[a-z]/.test(password), /[A-Z]/.test(password), /[0-9]/.test(password), Array.from(password).some((character) => PASSWORD_SYMBOLS.has(character))].filter(Boolean).length;
}

export async function evaluatePasswordStrength(password: string, userInputs: string[] = []): Promise<PasswordStrength> {
  const factory = await getFactory();
  const { score } = factory.check(password, [...userInputs, "komacook", "こまクック"]);
  const types = countPasswordCharacterTypes(password);
  const acceptable = password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH && types >= PASSWORD_MIN_CHARACTER_TYPES && score >= 2;
  const level = (score < 2 ? 1 : Math.max(1, types)) as 1 | 2 | 3 | 4;
  const validationMessage = password.length < PASSWORD_MIN_LENGTH
    ? `${PASSWORD_MIN_LENGTH}文字以上で入力してください。`
    : types < PASSWORD_MIN_CHARACTER_TYPES
      ? "英大文字・英小文字・数字・記号のうち3種類以上を使用してください。"
      : score < 2 ? "推測されにくい別のパスワードを設定してください。" : "";
  const labels = ["弱い", "もう少し", "強い", "とても強い"] as const;
  return { label: labels[level - 1], level, acceptable, validationMessage };
}

export async function validateNewPassword(password: string, userInputs: string[] = []) {
  if (password.length > PASSWORD_MAX_LENGTH) return `${PASSWORD_MAX_LENGTH}文字以内で入力してください。`;
  const result = await evaluatePasswordStrength(password, userInputs);
  return result.acceptable ? null : result.validationMessage;
}
