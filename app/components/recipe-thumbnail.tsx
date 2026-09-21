import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faImage } from "@fortawesome/free-solid-svg-icons";
import Image from "next/image";

type RecipeThumbnailProps = {
  imageUrl: string | null;
  title: string;
  className?: string;
  imageClassName?: string;
  sizes: string;
  priority?: boolean;
};

export function RecipeThumbnail({ imageUrl, title, className = "", imageClassName = "recipe-image", sizes, priority = false }: RecipeThumbnailProps) {
  if (!imageUrl) {
    return <span className={`recipe-no-image ${className}`.trim()} role="img" aria-label={`${title}の完成写真はありません`}>
      <FontAwesomeIcon icon={faImage} />
      <span>写真なし</span>
    </span>;
  }

  return <Image className={imageClassName} src={imageUrl} alt={`${title}の完成写真`} fill sizes={sizes} priority={priority} />;
}
