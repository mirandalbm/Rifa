# Ferramentas de imagem e vídeo para divulgar a rifa — panorama e plano

Pesquisa feita em 05/10/2026 sobre o que o Canva e o Adobe Express oferecem
a quem faz uma peça de divulgação, usada como **lista de referência** para
as ferramentas que construímos aqui, com os dados da rifa que só nós temos
e com a IA onde ela ajuda. O objetivo é saber o potencial inicial antes de
escolher por onde começar.

A decisão tomada depois da pesquisa está na seção 6: **nada de API deles;
construímos o que eles têm**, com a lista deles como referência. As regras
da casa que valem para qualquer ferramenta estão na seção 5.

## 1. Catálogo de referência: o que o Canva tem

Lista do que o organizador conhece do Canva. É **referência para o que
construímos**, não uma integração: nada daqui é chamado por API.

| Ferramenta do Canva | O que faz para quem usa |
|---|---|
| Modelos prontos | Layouts por tipo de peça (post, story, flyer) para preencher |
| Magic Resize | A mesma arte refeita para cada tamanho de rede |
| Texto, fontes e efeitos | Títulos, contorno, sombra, curvas |
| Elementos, formas, figurinhas e emojis | Peças soltas por cima da arte |
| Fotos e vídeos de banco | Biblioteca licenciada por conta |
| Cortar, enquadrar e remover fundo | Edição da foto |
| Magic Write | Escreve e reescreve o texto da peça |
| Magic Design | De um prompt ou de uma imagem enviada, monta layouts prontos |
| Magic Media, Magic Edit, Magic Eraser | Gera imagem e vídeo curto; troca e apaga partes |
| Editor de vídeo | Corte, legendas, trilhas, exportação em MP4 |
| Kit de marca | Logo, cores e fontes da marca aplicados nos modelos |
| Agendar e publicar | Agenda de postagens para as redes |
| Baixar e compartilhar | PNG, JPG, PDF, GIF, MP4 |

## 2. Catálogo de referência: o que o Adobe Express tem

A mesma lista, para o Express. Também só referência.

| Ferramenta do Express | O que faz para quem usa |
|---|---|
| Editor completo | Modelos, fontes, efeitos de texto, fotos de banco, complementos |
| Ações rápidas de imagem | Remover fundo, cortar, redimensionar, converter |
| Ações rápidas de vídeo | Cortar (trim), redimensionar, converter para MP4 ou GIF, recortar, juntar vídeos, animar com áudio, legendar |
| Firefly dentro do editor | Texto para imagem, preenchimento e expansão generativa, texto para vídeo |
| Animação | Movimento em texto e elementos |
| Kit de marca | Logo, cores e fontes |
| Agendar e publicar | Agenda para as redes |
| Baixar e compartilhar | Imagem, PDF, MP4 |

Fica registrado por que não integramos nenhum dos dois (decisão da seção
6): a revisão do Canva e a aprovação comercial da Adobe seriam gargalos fora
do nosso controle; a IA deles não sai pela API; o organizador precisaria de
conta e plano pago em outro lugar; e nenhum dos dois conhece os dados da
rifa, que são o que faz a nossa peça ser diferente.

## 3. O que já existe no sistema (e que nenhum editor de fora tem)

- Os dados da rifa: prêmio, preço, data, selo SPA/MF, cotas vendidas,
  ganhador, cota premiada revelada, o link do afiliado.
- Reprocessamento de imagem pelo `sharp` (WebP, corte ao centro, recorte
  "atento" ao assunto), medição de vídeo no servidor, `ffmpeg` local com
  limite de 2 ao mesmo tempo, Cloudflare Stream para pôster e HLS.
- Figurinhas do story (contagem, Comprar, texto, emoji) como **dados**,
  desenhadas pela tela — o adiamento muda a contagem sozinho e o texto
  continua varrível.
- Agenda de publicação (story, peça de divulgação, a própria rifa).
- Kit do afiliado (links e materiais), peça de divulgação com fotos e vídeo
  próprios.
- O assistente de IA dos painéis (Chatbase), com a ação de **legenda** já
  cadastrada.

## 4. Onde a IA entra — do mais barato ao mais caro

| Ferramenta | Como | Custo | Observação |
|---|---|---|---|
| Legenda e texto da arte sugeridos pelos dados da rifa | O assistente que já existe (ação `legenda`) ou um modelo de texto pelo servidor | Já pago na cobrança do assistente | Passa pela régua: sem link, sem telefone, varredura do Pix por fora |
| Recorte inteligente da foto para cada formato (4:5, 1:1, 9:16) | `sharp` com `position: attention` (procura o assunto) — já instalado | Zero | Não é IA generativa, mas resolve 80% do "ficou cortado" |
| Escolha da capa do reels | Quadros candidatos pelo `ffmpeg` + um critério simples (nitidez, não preto) | Zero | Hoje é sempre o quadro de 0,5 s |
| Remover fundo da foto do prêmio | Serviço por imagem, chamado pelo nosso servidor (há vários com preço por unidade) | Centavos por foto | Decidir quem paga: plataforma ou organizador |
| Legendas automáticas no vídeo (transcrição) | Serviço de transcrição chamado pelo nosso servidor; o texto vira figurinha (dado), não é gravado no vídeo | Centavos por minuto | Entra na mesma varredura de texto |
| Gerar imagem de fundo ou expandir a foto (generativo) | Provedor de imagem com preço por geração, chamado pelo nosso servidor | Por geração | Nada de rosto de pessoa real; marca d'água/aviso de "criado com IA" conforme a lei vier |
| Vídeo gerado a partir das fotos (movimento, texto, contagem) | `ffmpeg` local com fila (BullMQ), sem IA; o roteiro do vídeo pode vir da IA | Processamento nosso | É o item mais pesado do plano |

Regra para toda IA: a entrada é só a mídia e os dados **da rifa e da
organização**; nenhum dado de comprador sai do sistema (a mesma barreira do
assistente, `problemaNaMensagemDaIA`).

## 5. O que vale para qualquer ferramenta, de fora ou nossa

1. **Tudo entra pelo `ingest`**: duração, medidas, formato e legenda são
   decididos pelo servidor, nunca pelo editor que gerou o arquivo.
2. **Texto vira dado sempre que puder** (figurinhas): a varredura do Pix por
   fora só lê texto; o que for gravado na imagem passa pela régua **antes**
   de virar pixel, dentro do nosso editor.
3. **O servidor não recomprime vídeo** fora do Stream; corte é em modo cópia.
4. **Script de terceiro só com origem na CSP** e só nos painéis (nunca na
   página pública do apostador).
5. **Chaves e tokens no cofre** (`COFRE_CHAVE`), nunca no banco em claro nem
   no código.
6. **Sem música ou trilha sem licença; sem prova social inventada** nas artes
   (o "faltam N cotas" é o número real).
7. **Nenhum dado de comprador** em arte pública além do que já é público
   (nome curto do ganhador).

## 6. Decisão: construir o que eles têm, sem conectar a API deles

Decidido em 05/10/2026: **nenhuma integração com a API do Canva nem da
Adobe**. O catálogo das seções 1 e 2 é a lista de referência do que a
pessoa espera de um editor; cada item é feito aqui, com os dados da rifa que
só nós temos. Os motivos estão no fim da seção 2.

A IA continua entrando (seção 4), mas por **provedores de serviço por
unidade** escolhidos por nós (geração de imagem, remoção de fundo,
transcrição), nunca pelo editor de terceiro.

### 6.1 Mapa de paridade: o que eles têm → o que fazemos

| Deles | Nossa versão | Fase |
|---|---|---|
| Modelos prontos (templates) | Modelos nossos em SVG, preenchidos pelos dados da rifa (arte da rifa, faltam N, contagem, resultado, cota premiada) | A |
| Redimensionar para cada rede (Magic Resize) | Os três formatos (4:5, 1:1, 9:16) gerados de uma vez, com o recorte atento do `sharp` | A |
| Texto, fontes e efeitos | Figurinha de texto com as fontes da plataforma (DM Mono para número, a de exibição para título), contorno e sombra | C |
| Figurinhas, formas e emojis | As figurinhas do story (contagem, Comprar, texto, emoji) + logo, preço, QR, selo SPA/MF | C |
| Fotos de banco | Não entra: a foto é do prêmio e da organização (as fotos de banco deles são licenciadas por conta) | — |
| Cortar e enquadrar imagem | Enquadramento por formato no editor, com o recorte atento como ponto de partida | C |
| Remover fundo (imagem) | Serviço por unidade pelo servidor, com a imagem reprocessada depois pelo `sharp` | C |
| Escrever o texto (Magic Write) | Legenda e texto da arte sugeridos pelo assistente que já existe (ação `legenda`), na régua | C |
| Cortar vídeo (trim) | `ffmpeg` local em modo cópia (corta nos quadros-chave, sem recomprimir) | D |
| Capa do vídeo | Escolha do quadro entre candidatos do `ffmpeg` | D |
| Texto e figurinhas por cima do vídeo | Como no story: dados desenhados pelo player, nunca gravados no vídeo (a contagem acompanha o adiamento, o texto segue varrível) | D |
| Legendar vídeo (captions) | Transcrição por serviço por unidade, revisada pela pessoa, guardada como figurinha de legenda | D |
| Redimensionar e converter vídeo | Não entra: o `ingest` já aceita MP4 e MOV e mede; vídeo deitado não vira reels (é a régua) | — |
| Juntar vídeos / animar com áudio | Não entra agora: exigiria recomprimir; reavaliar com a fila da Fase F | — |
| Magic Design (de uma referência ou prompt → layout pronto) | **Recriar a partir de uma referência**: a pessoa envia uma foto ou um modelo que viu; a IA de visão lê o layout e devolve um modelo nosso (dados), que o sistema preenche com a rifa e as informações oficiais do sorteio | B |
| Gerar imagem por IA (Magic Media / Firefly) | Provedor de imagem por geração, só para **fundo e cenário**; nunca rosto de pessoa real; marcado "criado com IA" | E |
| Expandir e preencher (generativo) | Mesmo provedor, para completar a foto do prêmio no 9:16 | E |
| Vídeo gerado | Reels automático com as fotos da rifa (movimento lento, prêmio, preço, contagem) pelo `ffmpeg` local, com a fila (BullMQ) | F |
| Música e trilha | Não entra: sem biblioteca licenciada, o som é o do próprio vídeo | — |
| Marca (brand kit) | Já existe: logo, cor de destaque e capa da organização (`validarDestaque`) entram nos modelos e figurinhas | A |
| Agendar e publicar | Já existe (story, peça, rifa); a Fase G liga o pacote pronto à agenda | G |
| Compartilhar e baixar | "Baixar" e "Compartilhar" (Web Share) em cada arte e no kit do afiliado | A |

### 6.2 Plano por fases (tudo nosso)

Cada fase é um conjunto de PRs pequenos, cada um com prova, docs e registro
em `docs/VERSOES.md`. A tela de criar é a mesma dos Reels (tela cheia no
celular e no tablet, ferramentas em ícones por cima da peça; o cartão no
computador).

**Fase A — Artes prontas com os dados da rifa (servidor) · ~2 PRs.**
Modelos em SVG renderizados pelo `sharp` nos três formatos: arte da rifa
(prêmio, preço, data, selo, QR do link — o do afiliado com o código dele),
"faltam N cotas", contagem para o sorteio, resultado (número contemplado,
nome curto e foto do ganhador), cota premiada revelada. A marca da
organização (logo e cor de destaque) entra nos modelos. "Baixar" e
"Compartilhar" no cartão da publicação e no kit do afiliado.
**Feita (08/10/2026).** Regras em `shared/artes.ts`, desenho em
`server/services/arteDesenho.ts` (o texto vira contorno pelas fontes do
`@fontsource`, sem depender de fonte no servidor; o QR é desenhado) e
`server/services/artes.ts` (os dados da rifa, o fundo, a foto da
organização); as rotas `/api/admin/campaigns/:id/artes*` e
`/api/affiliate/artes/:slug*`; o cartão "Artes para divulgar" na aba
Publicação e "Artes prontas para postar" em Meus links. `npm run artes`
prova. Ficou para a Fase C: escolher a foto de fundo (hoje é a capa da
rifa, ou a foto do ganhador no resultado).

**Fase B — Recriar a partir de uma referência (IA de visão) · ~3 PRs.**
A pessoa escolhe uma foto ou um modelo externo (um flyer que viu, uma arte
antiga dela, um print) e envia. Um modelo de visão lê a peça e devolve
**um modelo nosso, em dados** (`shared/modelos.ts`: fundo, blocos, cores,
fontes da plataforma, posições e hierarquia do texto) — nunca HTML, script
ou imagem pronta. O sistema mostra o modelo recriado já **preenchido com a
rifa** (prêmio, preço, data) e com as **informações oficiais do sorteio**
(selo e número da autorização SPA/MF, a loteria e o concurso quando a rifa
está num sorteio oficial, a regra da aproximação quando couber), e a pessoa
troca o que quiser (o texto promocional dela, a foto do prêmio no lugar da
foto da referência) no editor da Fase C. Regras próprias:
- **Recria o leiaute e o estilo, não copia a arte**: a foto, a logo e a
  marca da referência não entram — são substituídas pela foto do prêmio, a
  logo e a cor da organização. É o que evita usar a arte de outro promotor
  (ou de outra marca) com a assinatura da plataforma.
- O que o modelo de visão devolve passa por `validarModelo()` (só chaves
  conhecidas, cores em `#rrggbb`, fontes da lista, blocos dos tipos que o
  renderizador sabe desenhar) — como `validarTemplate()` do construtor. O
  texto proposto passa pela régua (sem link, sem telefone, varredura do Pix
  por fora) e as informações oficiais **não são editáveis** pela IA nem pela
  pessoa: saem da rifa.
- A referência enviada vai só ao provedor de visão, cifrada em trânsito, e
  é apagada depois de lida (a Privacidade diz isso); nenhum dado de
  comprador entra no pedido. Limite por pessoa (`hit`) e custo no modelo do
  assistente (franquia e pacote), porque cada leitura é uma chamada paga.
- Sem provedor configurado, a ferramenta não aparece (como o botão do
  Google sem as chaves).

**Fase C — Editor de imagem (navegador) · ~4 PRs.**
Foto própria, arte da Fase A ou modelo recriado na Fase B; enquadramento por
formato; figurinhas (as do story + logo, preço, QR, selo) com texto nas
fontes da plataforma; remover fundo pelo servidor; legenda e texto sugeridos
pelo assistente. O texto passa pela régua **antes** de virar imagem; a
exportação é pelo canvas do navegador e entra pelo envio de sempre.

**Fase D — Vídeo leve, sem recomprimir · ~4 PRs.**
Cortar início e fim (modo cópia), escolher a capa, figurinhas no reels como
dados, legendas por transcrição como figurinha de legenda (revisadas pela
pessoa).
**Em andamento.** Feito (08/10/2026): **escolher a capa** — a organização
arrasta até o quadro no vídeo do carrossel e no do Reels, e o servidor tira
aquele quadro pelo `ffmpeg` local (`escolherCapaDoVideo()`, `PUT
/media/:id/capa`, `npm run poster` prova). Faltam: cortar início e fim,
figurinhas no reels e legendas por transcrição (esta precisa de provedor).

**Fase E — Geração por IA (fundo, cenário, expansão) · ~2 PRs.**
Provedor de imagem por geração, escolhido pelo preço por unidade; só fundo e
cenário, nunca pessoa; marcado "criado com IA"; quem paga segue o modelo do
assistente (franquia e pacote).

**Fase F — Vídeo gerado pelo sistema · ~4 PRs.**
Reels automático com as fotos da rifa pelo `ffmpeg` local. É aqui que entra
a fila de trabalho (BullMQ) que o `CLAUDE.md` reserva para "trabalho pesado
de verdade".

**Fase G — Pacote pronto para postar · 1 PR.**
As artes nos três formatos, a legenda sugerida e o link curto, num zip ou
num toque de compartilhar, ligado à agenda que já existe.
**Feita (08/10/2026), sem a agenda.** "Baixar pacote" no mesmo cartão das
artes: um ZIP com a arte escolhida nos três formatos e a `legenda.txt`
(`legendaSugerida()` em `shared/artes.ts`; no painel, com o endereço curto
da rifa; no kit, com o link e o "#publi" do afiliado). O "Compartilhar"
manda a arte com a legenda. O ZIP é montado no servidor
(`server/services/zip.ts`, modo "store", sem dependência nova). Ligar o
pacote à agenda (postar na hora marcada) fica para quando houver a
publicação nas redes pela API — hoje a postagem é da pessoa.

## 7. O que precisa ser feito fora do código

- **Serviços por unidade** (leitura da referência por visão, remover fundo,
  transcrição, geração de imagem): escolher os provedores e decidir quem paga — a plataforma ou o organizador,
  no modelo de franquia e pacote do assistente.
- ~~**Fontes**: confirmar a licença das fontes da plataforma para uso em
  imagem gerada.~~ Conferido: as três são OFL e permitem
  (`docs/LICENCAS-DE-TERCEIROS.md`).
- **Aviso de "criado com IA"**: definir o texto e onde aparece, junto com o
  advogado, antes da Fase E.
- **Recriar a partir de referência** (Fase B): confirmar com o advogado o
  limite entre inspirar-se no leiaute e copiar arte alheia; a regra do
  sistema é trocar foto, logo e marca pela da organização.

## Fontes consultadas

Páginas de produto e documentação pública dos dois, lidas só para montar o
catálogo de referência: [Canva Connect API (visão geral)](https://canva.dev/docs/connect/), [Canva: submissão para revisão](https://www.canva.dev/docs/connect/submitting-integrations/), [Canva: exportação](https://www.canva.dev/docs/connect/api-reference/exports/create-design-export-job/), [Canva: autofill e brand templates](https://www.canva.dev/docs/connect/api-reference/brand-templates/), [Adobe Express Embed SDK](https://developer.adobe.com/express/embed-sdk/docs/), [Adobe Express: submissão e revisão](https://developer.adobe.com/express/embed-sdk/docs/guides/review/), [Adobe Firefly: planos e créditos](https://www.adobe.com/cc-shared/fragments/products/firefly/plans/faq), [Firefly Services: preço empresarial](https://redresscompliance.com/adobe-firefly-enterprise-pricing-2026).
