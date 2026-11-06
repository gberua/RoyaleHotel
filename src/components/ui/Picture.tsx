import Image, { type ImageProps } from "next/image";
import type { Img } from "@/lib/data";
import { tr } from "@/lib/i18n-content";

type Props = Omit<ImageProps, "src" | "alt" | "width" | "height" | "placeholder" | "blurDataURL"> & {
  image: Img | null | undefined;
  locale: string;
  alt?: string;
};

/** next/image wrapper: AVIF/WebP at responsive sizes, blur-up placeholder, localized alt text. */
export function Picture({ image, locale, alt, fill, className, ...rest }: Props) {
  if (!image) return <div className={`bg-gradient-to-br from-sea-100 to-sand-100 ${className ?? ""}`} aria-hidden />;
  const altText = alt ?? tr(image.alt, locale);
  const common = {
    src: image.url,
    placeholder: image.blurDataUrl ? ("blur" as const) : ("empty" as const),
    blurDataURL: image.blurDataUrl ?? undefined,
    className,
    ...rest,
  };
  return fill ? <Image {...common} alt={altText} fill /> : <Image {...common} alt={altText} width={image.width} height={image.height} />;
}
