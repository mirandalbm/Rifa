import { useState } from "react";

export interface MediaSource {
  url: string;
  srcSetAvif?: string | null;
  srcSetWebp?: string | null;
  lqip?: string | null;
  altText?: string | null;
}

/**
 * Imagem com variantes e blur de carregamento.
 *
 * O `sizes` importa tanto quanto o `srcset`: sem ele o navegador assume a
 * largura da viewport e baixa a maior variante mesmo num celular — que é
 * exatamente o desperdício que as variantes existem para evitar.
 */
export function ResponsiveImage({
  media,
  alt,
  sizes,
  className = "",
  ...rest
}: {
  media: MediaSource;
  alt: string;
  sizes: string;
  className?: string;
} & React.ImgHTMLAttributes<HTMLImageElement>) {
  const [loaded, setLoaded] = useState(false);

  return (
    <picture>
      {media.srcSetAvif ? (
        <source type="image/avif" srcSet={media.srcSetAvif} sizes={sizes} />
      ) : null}
      {media.srcSetWebp ? (
        <source type="image/webp" srcSet={media.srcSetWebp} sizes={sizes} />
      ) : null}
      <img
        {...rest}
        src={media.url}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={className}
        style={
          !loaded && media.lqip
            ? {
                backgroundImage: `url(${media.lqip})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                ...rest.style,
              }
            : rest.style
        }
      />
    </picture>
  );
}
