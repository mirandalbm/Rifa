# Ferramentas de imagem e vídeo para divulgar a rifa — panorama e plano

Pesquisa feita em 05/10/2026 sobre o que o Canva e a Adobe oferecem por
API, o que disso cabe na estrutura deste sistema, o que vale mais a pena
fazer por conta própria e onde a IA entra. O objetivo é saber o potencial
inicial antes de escolher por onde começar.

A decisão tomada depois da pesquisa está na seção 6: **nada de API deles;
construímos o que eles têm**, com a lista deles como referência. As regras
da casa que valem para qualquer ferramenta estão na seção 5.

## 1. O que o Canva oferece (Connect API)

A integração do Canva é **entre servidores e contas**: o organizador
autoriza a nossa plataforma na conta Canva dele (OAuth 2.0 com PKCE), e
dali em diante o nosso servidor conversa com o Canva em nome dele. A pessoa
**continua desenhando no canva.com** — não existe editor do Canva embutido
na nossa tela (isso é o Apps SDK, que faz o contrário: põe a nossa tela
dentro do editor deles).

| Recurso | O que faz | Cabe aqui? |
|---|---|---|
| Designs API | Cria um design (vazio, ou a partir de uma imagem nossa) e lista os existentes | Sim: "Criar no Canva" partindo do banner da rifa |
| Return navigation | Manda o organizador para editar no Canva com um endereço de volta; ao terminar, ele volta para nós com o id do design | Sim: é a ida e volta do fluxo |
| Exports API | Exporta o design em PNG, JPG, PDF, GIF, PPTX e **MP4** (480p a 4k, em pé ou deitado), por um trabalho assíncrono que depois baixamos | Sim: o arquivo baixado entra pelo nosso envio de mídia |
| Assets API | Sobe e lê imagens, vídeos e áudios da pasta de uploads da pessoa | Sim: mandar a capa e as fotos da rifa para a conta dela |
| Brand Templates + Autofill | Preenche um modelo da marca com dados (texto, imagem) e gera o design pronto | **Só com Canva Enterprise** do lado do organizador — fora do nosso público |
| Folders e Comments | Organização e comentários | Sem uso para nós |
| Webhooks (collaboration:event) | Avisa quando algo muda no design | Opcional |
| IA do Canva (Magic Media, Magic Edit, Magic Write, Magic Design) | Gera imagem e vídeo curto, apaga e troca partes, escreve texto | **Não sai pela Connect API**: só dentro do editor deles, com os créditos de IA da conta do organizador |

Exigências fora do código:
- Registrar a integração no portal de desenvolvedores do Canva e, para
  ficar aberta a qualquer organizador, **passar pela revisão do Canva**
  (fila com ticket; as permissões pedidas têm de ser justificadas).
- O organizador precisa de conta Canva; os recursos pagos (fotos de banco,
  Magic Studio, remoção de fundo) dependem do plano dele.

Custo para nós: nenhum pela API. Trabalho: 3 a 4 PRs (OAuth e tokens no
cofre, ida e volta, exportação assíncrona, download pelo servidor e entrada
pelo `ingest`), mais a espera da revisão.

## 2. O que a Adobe oferece

### 2a. Adobe Express Embed SDK (editor dentro da nossa página)

O editor completo do Express abre **numa janela por cima do nosso painel**
(iframe), a pessoa monta a arte e o resultado volta para o nosso código como
arquivo, sem passar pelo nosso servidor até o envio de sempre.

| Módulo | O que faz | Cabe aqui? |
|---|---|---|
| Editor completo | Modelos, fontes, efeitos de texto, fotos de banco, exportação de imagem | Sim: "Editar no Express" no cartão da publicação e na tela de criar Reels |
| Ações rápidas de imagem | Remover fundo, cortar, redimensionar, converter | Sim: cada uma é um botão com poucas linhas |
| Ações rápidas de vídeo | Redimensionar, **cortar**, converter para MP4 ou GIF, recortar, juntar vídeos, animar com áudio, **legendar** | Sim, e cobre quase toda a nossa Fase C |
| Geração por IA (Firefly dentro do editor) | Texto para imagem, preenchimento e expansão generativa | Dentro do editor; o crédito é da conta Adobe da pessoa |

Exigências fora do código:
- O SDK é gratuito para avaliar e testar, mas o uso em produção passa por
  **aprovação comercial da Adobe** (eles priorizam integrações com público
  definido e impacto claro) e depois pela revisão da integração.
- Chave de cliente (client id) com os nossos domínios autorizados; os
  recursos premium dependem do plano Express do usuário final.

Custo para nós: nenhum anunciado para o SDK em si; pode haver termos
comerciais conforme a escala. Trabalho: 2 a 3 PRs (a janela, a entrada do
arquivo pelo envio de sempre, as origens deles na CSP, um Express de
mentira para a CI).

### 2b. Firefly Services (APIs de servidor)

As APIs que o nosso **servidor** chamaria, sem tela da Adobe: Firefly
(texto para imagem, preenchimento e expansão generativa, texto para vídeo),
Photoshop API (remover fundo, máscaras, ajustes), Lightroom API. É o que
alimenta o conector da Adobe desta sessão (remover fundo, cortar e
redimensionar, expandir, preencher área, vetorizar, redimensionar e renderizar
vídeo, corte rápido, animar design, recomendar fonte, extrair marca).

Cabe tecnicamente (é só chamada de API, como o Stream), mas o **acesso é por
contrato empresarial com vendas da Adobe** — não há preço público nem
autoatendimento, e os relatos de mercado falam em piso na casa de
US$ 1.000/mês, medido em créditos por operação. Fica como opção para depois
do lançamento, se o volume justificar.

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
| Remover fundo da foto do prêmio | Serviço de API por imagem (há vários com preço por unidade) ou a ação rápida do Express | Centavos por foto, ou crédito do usuário no Express | Decidir quem paga: plataforma ou organizador |
| Legendas automáticas no vídeo (transcrição) | API de transcrição pelo servidor; o texto vira figurinha (dado), não é gravado no vídeo | Centavos por minuto | Entra na mesma varredura de texto |
| Gerar imagem de fundo ou expandir a foto (generativo) | Firefly Services (contrato), ou outro provedor de imagem com preço por geração | Por geração | Nada de rosto de pessoa real; marca d'água/aviso de "criado com IA" conforme a lei vier |
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
só nós temos. Os motivos: a revisão do Canva e a aprovação comercial da
Adobe são gargalos fora do nosso controle; a IA deles não sai pela API; e o
organizador não precisa de conta nem de plano pago em outro lugar.

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

## 7. O que precisa ser feito fora do código

- **Serviços por unidade** (leitura da referência por visão, remover fundo,
  transcrição, geração de imagem): escolher os provedores e decidir quem paga — a plataforma ou o organizador,
  no modelo de franquia e pacote do assistente.
- **Fontes**: confirmar a licença das fontes da plataforma para uso em
  imagem gerada (as do Google Fonts permitem).
- **Aviso de "criado com IA"**: definir o texto e onde aparece, junto com o
  advogado, antes da Fase E.
- **Recriar a partir de referência** (Fase B): confirmar com o advogado o
  limite entre inspirar-se no leiaute e copiar arte alheia; a regra do
  sistema é trocar foto, logo e marca pela da organização.

## Fontes consultadas

- Canva Connect API: [visão geral](https://canva.dev/docs/connect/), [criação de integrações](https://www.canva.dev/docs/connect/creating-integrations/), [submissão para revisão](https://www.canva.dev/docs/connect/submitting-integrations/), [lista de verificação](https://www.canva.dev/docs/connect/submission-checklist/), [escopos](https://www.canva.dev/docs/connect/appendix/scopes/), [exportação](https://www.canva.dev/docs/connect/api-reference/exports/create-design-export-job/), [autofill](https://www.canva.dev/docs/connect/api-reference/autofills/), [brand templates](https://www.canva.dev/docs/connect/api-reference/brand-templates/), [lançamento](https://canva.dev/blog/developers/launching-to-all-connect-api), [Apps SDK vs Connect](https://polotno.com/canva-api).
- Adobe Express Embed SDK: [página do SDK](https://developer.adobe.com/express/embed-sdk/), [documentação](https://developer.adobe.com/express/embed-sdk/docs/), [editor completo](https://developer.adobe.com/express/embed-sdk/docs/guides/full_editor/), [submissão e revisão](https://developer.adobe.com/express/embed-sdk/docs/guides/review/).
- Adobe Firefly / Firefly Services: [planos e créditos](https://www.adobe.com/cc-shared/fragments/products/firefly/plans/faq), [preço empresarial 2026](https://redresscompliance.com/adobe-firefly-enterprise-pricing-2026), [Photoshop API 2026](https://sudomock.com/blog/adobe-photoshop-api-pricing-2026).
