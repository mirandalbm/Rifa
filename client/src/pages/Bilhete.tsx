import { useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { formatBRL } from "@shared/format";

interface Ticket {
  codigo: number;
  emitidoEm: string;
  administradora: {
    nome: string;
    cnpj?: string;
    contato?: string;
    cidade?: string;
    observacao?: string;
  };
  apostador: { nome: string; telefone: string; cpf: string | null; id?: string | null };
  rifa: {
    titulo: string;
    premio: string;
    totalCotas: number;
    precoCota: number;
    autorizacao: string | null;
  };
  sorteio: { data: string | null; metodo: string; seedHash: string | null };
  numeros: string[];
  pagamento: {
    metodo: string;
    situacao: string;
    total: number;
    desconto: number;
    autorizacao: string | null;
  };
  vendedor: { nome: string; codigo: string } | null;
}

/**
 * Bilhete para impressão.
 *
 * A folha é de 58 mm — o tamanho da bobina das maquininhas — e a mesma
 * página imprime bem em A4. Tudo em preto no branco: impressora térmica
 * não tem cor, e fundo colorido vira borrão.
 */
export default function Bilhete() {
  const { code } = useParams<{ code: string }>();
  const { data: t, error } = useQuery<Ticket>({
    queryKey: [`/api/public/tickets/${code}`],
  });

  useEffect(() => {
    if (!t) return;
    if (new URLSearchParams(window.location.search).get("auto") === "1") {
      // Um quadro para a fonte carregar antes de a janela de impressão abrir.
      const id = setTimeout(() => window.print(), 400);
      return () => clearTimeout(id);
    }
  }, [t]);

  // Sem isto, bilhete inexistente ou consulta barrada ficava em "Carregando"
  // para sempre — o erro vem do servidor já em português.
  if (error) {
    return <p style={{ padding: 24, fontFamily: "monospace" }}>{error.message}</p>;
  }

  if (!t) {
    return <p style={{ padding: 24, fontFamily: "monospace" }}>Carregando bilhete…</p>;
  }

  const sorteio = t.sorteio.data
    ? new Date(t.sorteio.data).toLocaleDateString("pt-BR")
    : "a definir";

  return (
    <>
      <style>{`
        @page { size: 58mm auto; margin: 3mm; }
        @media print {
          .nao-imprime { display: none !important; }
          body { background: #fff; }
        }
        .bilhete {
          width: 58mm;
          margin: 0 auto;
          padding: 4mm 2mm;
          background: #fff;
          color: #000;
          font-family: "DM Mono", ui-monospace, monospace;
          font-size: 9.5pt;
          line-height: 1.35;
        }
        .bilhete h1 { font-size: 11pt; margin: 0; text-align: center; letter-spacing: .02em; }
        .bilhete .centro { text-align: center; }
        .bilhete .regua { border-top: 1px dashed #000; margin: 2mm 0; }
        .bilhete .forte { border-top: 2px solid #000; margin: 2mm 0; }
        .bilhete .par { display: flex; justify-content: space-between; gap: 2mm; }
        .bilhete .rotulo { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; }
        .bilhete .numeros { display: flex; flex-wrap: wrap; gap: 1mm; margin-top: 1mm; }
        .bilhete .numero { border: 1px solid #000; padding: 0.5mm 1mm; font-size: 9pt; }
        /* anywhere, e nao break-all: o hash da semente e uma palavra de 32
           caracteres sem espaco e PRECISA quebrar para caber nos 58 mm, mas
           break-all aplicava isso ao texto corrido tambem, e o rodape saia
           com "pagamento co / nfirmado". */
        .bilhete .mini { font-size: 7pt; overflow-wrap: anywhere; }
      `}</style>

      <div className="nao-imprime" style={{ textAlign: "center", padding: "12px" }}>
        <button
          type="button"
          onClick={() => window.print()}
          style={{
            background: "#00873E",
            color: "#fff",
            border: 0,
            borderRadius: 8,
            padding: "10px 18px",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Imprimir bilhete
        </button>
      </div>

      <div className="bilhete">
        <h1>{t.administradora.nome.toUpperCase()}</h1>
        {t.administradora.cnpj ? (
          <p className="centro mini">CNPJ {t.administradora.cnpj}</p>
        ) : null}
        {t.administradora.cidade ? (
          <p className="centro mini">{t.administradora.cidade}</p>
        ) : null}

        <div className="forte" />
        <p className="centro">BILHETE DE RIFA</p>
        <p className="centro" style={{ fontSize: "13pt" }}>
          Nº {t.codigo}
        </p>
        <div className="regua" />

        <p className="rotulo">Prêmio</p>
        <p>{t.rifa.premio}</p>
        <div className="par">
          <span>Cota</span>
          <span>{formatBRL(t.rifa.precoCota)}</span>
        </div>
        <div className="par">
          <span>Sorteio</span>
          <span>{sorteio}</span>
        </div>
        <p className="mini">{t.sorteio.metodo}</p>

        <div className="regua" />
        <p className="rotulo">Apostador</p>
        <p>{t.apostador.nome}</p>
        {t.apostador.id ? <p className="tnum">ID {t.apostador.id}</p> : null}
        <p>{t.apostador.telefone}</p>
        {t.apostador.cpf ? <p>CPF {t.apostador.cpf}</p> : null}

        <div className="regua" />
        <p className="rotulo">Números ({t.numeros.length})</p>
        <div className="numeros">
          {t.numeros.map((n) => (
            <span key={n} className="numero">
              {n}
            </span>
          ))}
        </div>

        <div className="regua" />
        <div className="par">
          <span>Pagamento</span>
          <span>{t.pagamento.metodo}</span>
        </div>
        {t.pagamento.desconto > 0 ? (
          <div className="par">
            <span>Desconto</span>
            <span>−{formatBRL(t.pagamento.desconto)}</span>
          </div>
        ) : null}
        <div className="par" style={{ fontSize: "11pt" }}>
          <span>TOTAL</span>
          <span>{formatBRL(t.pagamento.total)}</span>
        </div>
        <p className="centro" style={{ marginTop: "1mm" }}>
          {t.pagamento.situacao}
        </p>
        {t.pagamento.autorizacao ? (
          <p className="mini">Autorização {t.pagamento.autorizacao}</p>
        ) : null}

        {t.vendedor ? (
          <>
            <div className="regua" />
            <div className="par">
              <span>Vendedor</span>
              <span>{t.vendedor.codigo}</span>
            </div>
            <p className="mini">{t.vendedor.nome}</p>
          </>
        ) : null}

        <div className="forte" />
        {t.rifa.autorizacao ? (
          <p className="mini">Autorização SPA/MF: {t.rifa.autorizacao}</p>
        ) : null}
        {t.sorteio.seedHash ? (
          <p className="mini">Semente (hash): {t.sorteio.seedHash.slice(0, 32)}</p>
        ) : null}
        {t.administradora.observacao ? (
          <p className="mini">{t.administradora.observacao}</p>
        ) : null}
        {t.administradora.contato ? (
          <p className="mini centro">{t.administradora.contato}</p>
        ) : null}
        <p className="centro mini">
          Emitido em {new Date(t.emitidoEm).toLocaleString("pt-BR")}
        </p>
      </div>
    </>
  );
}
