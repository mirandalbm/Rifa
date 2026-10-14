# Marca — Loterias do Bem

Arquivos de origem da marca. Nada aqui é servido pelo app: o que vai ao ar
(ícones do app, manifesto, logo em Aparência) é copiado daqui quando a troca
for aprovada. A intro já está no app como animação (celular e tablet):
`client/src/components/IntroDaMarca.tsx`, com as peças em `client/public/intro/`.

| Arquivo | O que é |
|---|---|
| `logo-oficial.png` | A logo oficial: trevo de 4 folhas nas cores do trevo antigo, os dois corações e o sublinhado em vermelho, sem os raios e as estrelinhas. 2048 × 2048. |
| `icone-folha-de-cima-vermelha.png` (e `-512`) | Ícone do app, versão 1: trevo redesenhado (4 folhas iguais) com a folha de cima vermelha. 2048 e 512 (Play Store). |
| `icone-folha-da-direita-vermelha.png` (e `-512`) | Ícone do app, versão 2: o mesmo trevo com a folha da direita vermelha. |
| `logo-loterias-do-bem.svg` (e `.png`) | A logo horizontal, para fundo claro: o trevo do ícone (a folha da direita vermelha) à esquerda e "Loterias do Bem" na Google Sans Flex 400 (reta), numa linha, "Bem" em vermelho. SVG vetorial e PNG de 2048 de largura, fundo transparente. |
| `logo-loterias-do-bem-escuro.svg` (e `.png`) | A mesma logo para fundo escuro, com os tons do tema escuro (o PNG já vem com o fundo `#0e1712`). |
| `intro-loterias-do-bem.mp4` | Intro animada do app com a logo oficial: 1080 × 1920, 60 quadros por segundo, 3,4 s, sem som. |

A logo escrita é **gerada**: `npm run logo-escrita` (`scripts/logo-escrita.ts`)
desenha a frase na Google Sans Flex 400 (reta), numa linha e grava os quatro arquivos
acima, os contornos que o topo do site usa reduzidos
(`client/src/lib/logoEscritaDesenho.ts`) e o trevo da abertura no
`client/index.html`. As cores
são as de `CORES_DA_LOGO` (`client/src/lib/marca.ts`). Mudou o desenho ou a
cor, rode de novo — nunca edite os arquivos gerados à mão.

## A intro, quadro a quadro

0. Antes do JavaScript, o `index.html` já mostra o trevo no meio da tela branca, onde o celular mostrou o ícone.
1. O trevo sai do meio da tela e vai ao lugar dele na logo, com um pequeno giro no fim (0,1 a 1 s).
2. "Loterias" e depois "do Bem" aparecem da esquerda para a direita, subindo de leve (0,75 a 1,5 s).
3. O sublinhado vermelho se desenha (1,35 a 1,9 s).
4. Os corações saltam, um depois do outro (1,6 a 2,2 s).
5. Um brilho passa pelo trevo (2,05 a 2,6 s) e os corações batem duas vezes (2,55 a 3,1 s).

## Cores e regras

- O vermelho da logo é **identidade**, não estado: na interface, vermelho
  continua sendo erro. Não copie esse vermelho para botão ou aviso.
- Na intro, no topo e na logo horizontal, o trevo é o do ícone (a folha da
  direita vermelha), desenhado em vetor (`TrevoDaMarca`); a logo oficial em
  PNG ainda tem o trevo antigo, todo verde.
