# Pedido ao advogado: anexo do contrato para o tráfego pago, modelo B (10/10/2026)

Pedido para o item 3 de `docs/TERMO-DE-ENCERRAMENTO-ADVOGADO.md` (prazo: 10 dias
úteis). Segue o método da rodada final: cada ponto abaixo traz o **Padrão**
(o que o sistema vai fazer se não houver resposta), para o anexo sair sem nova
rodada de perguntas.

## 1. O que o anexo precisa ser

Um anexo ao contrato da plataforma com a promotora (o contrato está em
`shared/contratoPromotora.ts` e os anexos por modalidade em
`shared/contratoAnexos.ts`). Tem **versão própria, aceite próprio**
(texto, impressão SHA-256, IP, aparelho) e só vale para a promotora que pedir
tráfego pago. Entregar em **texto corrido, cláusulas numeradas**, com os dados
da empresa como campos, não digitados: `{{RAZAO_SOCIAL}}`, `{{CNPJ}}`,
`{{ENDERECO}}`, `{{EMAIL}}`. Assim o anexo pode ser redigido antes de existirem
razão social e CNPJ definitivos.

## 2. Como o modelo B funciona (o texto não pode prometer outra coisa)

1. A **promotora é titular da conta de anúncios** (Meta no início; Google e TikTok
   depois, só com confirmação escrita de cada rede) e **paga a mídia direto à
   rede**. A plataforma **não toca a mídia**.
2. A plataforma **gere** a campanha com acesso de **parceiro com permissão só de
   gestão**; nunca pede login e senha. A promotora pode revogar o acesso a
   qualquer hora.
3. A promotora fixa **no próprio Meta** o orçamento total (teto rígido da rede).
4. A plataforma cobra uma **taxa de gestão em % sobre o gasto lido** da conta
   (padrão 20%, tabela da plataforma, percentual fotografado no pedido),
   **debitada de um saldo de taxa** que a promotora abastece por Pix da
   plataforma, à medida que o gasto é lido.
5. **Leitura do gasto a cada 1 hora; pausa automática ao atingir 90% da verba ou
   ao acabar o saldo de taxa**, com aviso à promotora. É obrigação de **meio**.
6. A sobra do saldo de taxa **volta como crédito**, nunca em dinheiro (D3); só há
   estorno ao mesmo pagador, a pedido. Carência do Pix de 7 dias só no
   primeiro abastecimento (P4).
7. Banimento da promotora gera **suspensão** do saldo (retenção cautelar), não
   apropriação; abater exige decisão judicial ou acordo assinado.
8. O anúncio sai pela **arte e pelo texto montados a partir dos dados da rifa**,
   com o número da autorização, 18+ e a regra "só vale bilhete pago pela
   plataforma". A plataforma o chama de **"conferido pela plataforma, sujeito à
   aprovação da rede"**, nunca "aprovado pelo Meta".

## 3. Cláusulas que preciso (marque "de acordo" ou "altera para")

| # | Cláusula | Padrão se não houver resposta |
|---|---|---|
| 1 | **Objeto e natureza**: prestação de serviço de gestão de campanhas em conta de titularidade da promotora | Prestação de serviços, **sem mandato de representação** perante a rede |
| 2 | **Acesso à conta**: permissão de parceiro só de gestão, revogável; a promotora mantém ao menos um administrador; a plataforma não guarda senha | O texto do item 2 acima |
| 3 | **Titularidade e responsabilidades da promotora**: cadastro e pagamento da conta, autorização da rede para jogos de azar (rifa é "jogo de azar online" na política do Meta), autorização SPA/MF própria, veracidade dos criativos, 18+, sem promessa de ganho | A promotora responde integralmente (P3) |
| 4 | **Orçamento e teto**: fixado pela promotora na rede; a plataforma não responde pelo gasto entre leituras acima do teto | Obrigação de meio (P2) |
| 5 | **Taxa de gestão**: percentual sobre o gasto lido, base (o que a API informa da conta), saldo de taxa, abastecimento por Pix, carência, mudança de tabela só vale para pedido novo | Base = gasto informado pela API, sem gross-up de imposto da rede |
| 6 | **Saldo de taxa**: sem saque, sem transferência, sobra como crédito, **vencimento do crédito com aviso 30 dias antes como cláusula contratual** (D3), estorno só ao mesmo pagador a pedido | Crédito com vencimento de 12 meses; você pode trocar o prazo |
| 7 | **Leitura e pausa**: a cada 1 hora, pausa aos 90%/saldo zerado, aviso, falha da rede ou da leitura não gera dever de indenizar além do ressarcimento da taxa do período | Texto do item 5 acima |
| 8 | **Conta restrita, anúncio reprovado ou campanha encerrada pela rede por conteúdo da promotora**: ela responde; a taxa já cobrada não volta; ela indeniza informação falsa nos criativos; a plataforma pode pausar ou encerrar a gestão na hora | P3 |
| 9 | **Dados pessoais**: papel de cada um (plataforma, promotora, Meta/Google no pixel e na API de conversões), consentimento do aviso de cookies, a plataforma não envia nome, CPF nem e-mail, só telefone em hash e identificador do clique | Plataforma controladora do próprio cadastro e **operadora** do que trata para a promotora nas campanhas; Meta controladora conjunta no pixel (D4) |
| 10 | **Tributos e documentos**: a plataforma emite nota **só da taxa**; a mídia é faturada pela rede à promotora; a promotora cuida do próprio imposto | A forma da nota é do contador |
| 11 | **Vigência e rescisão**: prazo indeterminado, rescisão por qualquer parte, pausa imediata das campanhas, destino do saldo de taxa (crédito, ou suspensão se houver retenção) | Crédito mantido até o vencimento |
| 12 | **Limitação de responsabilidade** da plataforma | Limitada à taxa paga nos 12 meses anteriores, salvo dolo ou culpa grave |
| 13 | **Aceite e versão**: uma vez por versão do anexo; **mais** o aceite do texto da taxa em cada pedido de campanha (já existe no sistema, versão 1) | Os dois aceites |
| 14 | **Foro** | Comarca de São Paulo (sede) |
| 15 | **Influenciadores**: fica de fora deste anexo; a cláusula de publicidade vai no contrato (item 6 do termo de encerramento) | Fora |

## 4. Três perguntas de enquadramento

Respondo com o Padrão se não vierem:

- **A.** O anexo deve dizer que a plataforma **não é agência de publicidade
  autorizada pela rede** ("parceira de gestão", não "agência")? Padrão: sim,
  diz o que a rede permite a cada parceiro, sem usar o nome "agência".
- **B.** A regra "**o aceite da taxa no pedido** e o **aceite do anexo** são
  independentes" tem algum risco? Padrão: manter os dois.
- **C.** Para a promotora **pessoa jurídica** (todas são), vale tratar a relação
  como empresarial (não consumidora) para fins de CDC? Padrão: sim, com a
  ressalva do art. 29 do CDC (equiparação) que você avalia.

## 5. O que eu entrego a ele junto

- `docs/RODADA-FINAL-ADVOGADO.md` (P1 a P8) e o termo de encerramento.
- Este pedido.
- O que **ainda não existe**: razão social definitiva e CNPJ (o dono os define
  depois do lançamento; o anexo usa os campos), o domínio (previsto para a
  segunda-feira, 12/10/2026) e o endereço oficial.

## 6. O que a falta dos dados trava

- **Não trava a redação do anexo**, que usa campos.
- **Trava a publicação** do contrato, do anexo, dos Termos de uso e da Privacidade:
  o sistema só publica texto com os "Dados da empresa" completos (CNPJ com dígito
  conferido, endereço, e-mail e encarregado), como exige o Decreto 7.962/2013,
  art. 2º, para o comércio eletrônico.
- **Trava as consultas formais à Meta e ao Google** (item 4 do termo de
  encerramento), que pedem razão social, CNPJ e a lista de rifas.

## 7. Mensagem pronta para enviar

> Doutor(a), segue o pedido do anexo do modelo B (item 3 do termo de
> encerramento, prazo de 10 dias úteis). O anexo deve usar os campos
> `{{RAZAO_SOCIAL}}`, `{{CNPJ}}`, `{{ENDERECO}}` e `{{EMAIL}}`, porque a razão
> social e o CNPJ definitivos serão informados depois. Estão em anexo o pedido
> (`PEDIDO-ANEXO-MODELO-B.md`, com as cláusulas 1 a 15 e os Padrões), a rodada
> final e a minuta do termo de encerramento. Para cada cláusula, basta "de
> acordo" ou "altera para". Sem resposta em 10 dias úteis, vale o Padrão.

## 8. Posição do contador sobre este pedido (10/10/2026)

Detalhe em `docs/RODADA-FINAL-CONTADOR.md` (terceiro retorno). O que muda para o
advogado:

- O anexo e o contrato chamam o produto de **"plataforma de gestão de tráfego
  pago"**, sem o nome "agência" (pergunta A: **resolvida, sem precisar de
  resposta**).
- Aceites independentes: **de acordo** pelo lado fiscal (pergunta B); o jurídico
  continua com o advogado.
- Relação empresarial (pergunta C): de acordo pelo contador, que remete o
  fundamento ao advogado. **Nota:** a definição de consumidor é o art. 2º do CDC
  (não o art. 3º, § 2º, que define "serviço"), com a ressalva do art. 29.
- Cláusula 6: crédito de 12 meses **fechado** com o contador; cláusula 12:
  sem impacto fiscal; a devolução judicial de taxa reduz a base do mês.
- Cláusula 7: a **pausa aos 90%** é o que evita o gasto excedente; o texto deve
  conter a regra e a obrigação de meio.
