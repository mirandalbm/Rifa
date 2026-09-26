import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

interface BannerNoAr {
  id: string;
  titulo: string;
  link: string | null;
  segundos: number;
  imagem: string;
}

/**
 * Banners da plataforma no topo da vitrine: carrossel de arrastar (2:1),
 * que passa sozinho no tempo de cada banner. Para quando a pessoa toca,
 * quando a aba some e para quem pediu menos movimento no aparelho.
 */
export function BannersVitrine() {
  const { data: banners = [] } = useQuery<BannerNoAr[]>({ queryKey: ["/api/public/banners"], staleTime: 60_000 });
  const trilho = useRef<HTMLDivElement>(null);
  const [atual, setAtual] = useState(0);
  const [parado, setParado] = useState(false);

  const irPara = (i: number) => {
    const el = trilho.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  useEffect(() => {
    if (banners.length < 2 || parado) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => {
      if (document.visibilityState === "visible") irPara((atual + 1) % banners.length);
    }, (banners[atual]?.segundos ?? 6) * 1000);
    return () => clearTimeout(t);
  }, [atual, parado, banners]);

  if (banners.length === 0) return null;

  return (
    <section
      aria-label="Destaques"
      aria-roledescription="carrossel"
      className="relative -mx-4 mb-3 sm:mx-0"
      onPointerDown={() => setParado(true)}
      onMouseEnter={() => setParado(true)}
      onMouseLeave={() => setParado(false)}
    >
      <div
        ref={trilho}
        className="flex snap-x snap-mandatory overflow-x-auto sm:rounded-xl"
        style={{ scrollbarWidth: "none" }}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtual(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {banners.map((b, i) => (
          <div
            key={b.id}
            className="aspect-[2/1] w-full shrink-0 snap-center bg-mist-2"
            aria-roledescription="slide"
            aria-label={`${i + 1} de ${banners.length}`}
          >
            <Destino link={b.link}>
              <img
                src={b.imagem}
                alt={b.titulo}
                loading={i === 0 ? "eager" : "lazy"}
                className="h-full w-full object-cover"
              />
            </Destino>
          </div>
        ))}
      </div>
      {banners.length > 1 ? (
        <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              aria-label={`Ver banner ${i + 1}: ${b.titulo}`}
              aria-current={i === atual}
              onClick={() => {
                setParado(true);
                irPara(i);
              }}
              className={`h-1.5 rounded-full transition-all ${i === atual ? "w-4 bg-branco" : "w-1.5 bg-branco/60"}`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** Caminho do site abre aqui mesmo; endereço de fora abre em outra aba. */
function Destino({ link, children }: { link: string | null; children: ReactNode }) {
  if (!link) return <>{children}</>;
  if (link.startsWith("/")) {
    return (
      <Link href={link} className="block h-full">
        {children}
      </Link>
    );
  }
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" className="block h-full">
      {children}
    </a>
  );
}
