import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faAppleWhole,
  faBowlFood,
  faBreadSlice,
  faCarrot,
  faCheese,
  faCookieBite,
  faMugHot,
  faUtensils,
} from "@fortawesome/free-solid-svg-icons";

const icons = {
  utensils: faUtensils,
  carrot: faCarrot,
  apple: faAppleWhole,
  bread: faBreadSlice,
  mug: faMugHot,
  bowl: faBowlFood,
  cheese: faCheese,
  cookie: faCookieBite,
} as const;

export const profileIconOptions = [
  ["utensils", "フォークとナイフ"], ["carrot", "にんじん"], ["apple", "りんご"], ["bread", "パン"],
  ["mug", "マグカップ"], ["bowl", "ボウル"], ["cheese", "チーズ"], ["cookie", "クッキー"],
] as const;

export const profileColorOptions = ["coral", "leaf", "mustard", "brown", "rose", "blue"] as const;

export function ProfileAvatar({
  avatarKind = "preset",
  presetKey = "utensils",
  color = "coral",
  imageUrl,
  className = "",
}: {
  avatarKind?: string | null;
  presetKey?: string | null;
  color?: string | null;
  imageUrl?: string | null;
  className?: string;
}) {
  const icon = icons[(presetKey ?? "utensils") as keyof typeof icons] ?? faUtensils;
  const safeColor = profileColorOptions.includes(color as (typeof profileColorOptions)[number]) ? color : "coral";

  return <span
    className={`member-avatar ${className}`.trim()}
    data-color={safeColor}
    style={avatarKind === "upload" && imageUrl ? { backgroundImage: `url("${imageUrl.replaceAll('"', "%22")}")` } : undefined}
    aria-hidden="true"
  >{avatarKind === "upload" && imageUrl ? null : <FontAwesomeIcon icon={icon} />}</span>;
}
