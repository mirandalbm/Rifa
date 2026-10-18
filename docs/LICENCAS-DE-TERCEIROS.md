# Licenças de terceiros

Desenhos usados no app que não são nossos. Os ícones ficam em
`client/src/components/Icones.tsx`, copiados como vêm da fonte (o reels
com os cantos arredondados). O crédito visível ao usuário está na tela do
perfil (`/perfil/configuracoes`, as Configurações do perfil).

| O quê | Onde | Autor | Licença |
|---|---|---|---|
| Ícones de mensagens, buscar, sacola (carrinho e comprar), perfil, publicar e comentar | console, barra de ações, topo | [Solar](https://www.figma.com/community/file/1166831539721848736), de 480 Design | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — pede o crédito; alterar é permitido |
| Ícone de republicar | barra de ações | [Tabler Icons](https://github.com/tabler/tabler-icons), de Paweł Kuna | MIT |
| Ícone de reels (cantos arredondados por nós) | console | [Iconoir](https://github.com/iconoir-icons/iconoir), de Luca Burgio | MIT |

A casa (Início), o trevo (curtir, avisos e selo) e o "+" do carrinho são
desenhos nossos.

## Bandeiras dos estados (painel "Locais")

O painel "Locais" da vitrine (`client/src/components/LocaisDaVitrine.tsx`)
mostra a bandeira de cada um dos 27 estados em círculo, ao lado do nome. Os
arquivos moram no próprio site (`client/public/bandeiras/<uf>.svg`), servidos
como imagem — nenhuma dependência de execução e nenhuma origem nova na CSP.

| O quê | Onde | Origem | Licença |
|---|---|---|---|
| 27 bandeiras de estado e a do Brasil (item "Nacional"), estilo `circle` | `client/public/bandeiras/<uf>.svg` e `br.svg`, painel "Locais" | [`pierrelapalu/icones-bandeiras-br-uf`](https://github.com/pierrelapalu/icones-bandeiras-br-uf), pasta `dist/circle/svg`, commit `ed47411` (28/10/2021) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) — dedicação ao domínio público; não pede crédito |

- **Só no painel "Locais"**: nenhuma bandeira vai no rodapé, em peça de
  divulgação ou em anúncio.
- **Escolha de cada arquivo**: o original `NN-<estado>-circle.svg`; só o
  Espírito Santo usa a variante `-v2` (com o lema "Trabalha e confia", que a
  bandeira oficial tem e a original do conjunto não traz). Ceará e Paraíba
  seguem o original (o brasão do Ceará e a palavra "Nego" da Paraíba).
- **Otimização**: SVGO 3 (fora do projeto, sem dependência), só para tirar
  título, classes e espaços (66 KB → 59 KB no total); o desenho e o
  `viewBox` ficam como vêm, e as cores não mudam.
- **Licença vs. uso**: a CC0 resolve a licença do **desenho** do conjunto. O
  uso da bandeira de estado numa plataforma comercial é pergunta ao advogado
  (R24 em `docs/PERGUNTAS-AO-ADVOGADO.md`); até a resposta, a bandeira é só o
  ícone do local, sempre com o nome escrito ao lado, e nunca vai em peça de
  divulgação nem em anúncio. Cada arquivo sai a imagem do estado — nenhuma foi
  desenhada por nós, e nenhuma bandeira foi inventada.

## Fontes e bibliotecas das artes prontas

As artes prontas (`server/services/arteDesenho.ts`) desenham o texto com as
fontes abaixo, vindas dos pacotes `@fontsource` (o arquivo da fonte vai junto
do servidor; a letra vira contorno dentro da imagem).

| O quê | Autor | Licença |
|---|---|---|
| Bricolage Grotesque | Ateliér Triay (Mathieu Triay) | [SIL Open Font License 1.1](https://openfontlicense.org) |
| Instrument Sans | Instrument | [SIL Open Font License 1.1](https://openfontlicense.org) |
| DM Mono | Colophon Foundry, para o Google | [SIL Open Font License 1.1](https://openfontlicense.org) |
| fontkit (leitura das fontes) | Devon Govett | MIT |

A OFL permite usar as fontes em imagens e embuti-las; só não permite vender
a fonte sozinha nem usar o nome reservado numa versão alterada — não fazemos
nenhum dos dois.

## Texto da licença MIT (Tabler Icons e Iconoir)

```
MIT License

Copyright (c) 2020-2024 Paweł Kuna (Tabler Icons)
Copyright (c) 2021 Luca Burgio (Iconoir)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
