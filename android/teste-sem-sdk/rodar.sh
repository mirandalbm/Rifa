#!/usr/bin/env bash
# Prova a integração da Stone por deeplink sem o Android SDK: compila
# `Terminal.kt`, `RetornoDeApp.kt` e o sabor `ton` contra classes mínimas do
# Android (`stubs/`, só o que o código usa) e roda `TesteStone.kt`, que finge
# ser o app de pagamento e o de impressão da Stone.
#
# Não substitui o build de verdade nem a venda de teste na maquininha: confere
# a montagem dos deeplinks, a leitura das respostas e a espera de uma operação
# por vez. Baixa o compilador Kotlin do Maven Central na primeira vez.
#
#   bash android/teste-sem-sdk/rodar.sh
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
SRC="$AQUI/../app/src"
CACHE="${CACHE_KOTLIN:-$HOME/.cache/rifa-kotlin}"
V=1.9.24
mkdir -p "$CACHE"
baixar() { [ -f "$CACHE/$2" ] || curl -sSfL -o "$CACHE/$2" "https://repo.maven.apache.org/maven2/$1/$2"; }
for a in kotlin-compiler-embeddable kotlin-stdlib kotlin-script-runtime kotlin-reflect kotlin-daemon-embeddable; do
  baixar "org/jetbrains/kotlin/$a/$V" "$a-$V.jar"
done
baixar "org/jetbrains/intellij/deps/trove4j/1.0.20200330" "trove4j-1.0.20200330.jar"
baixar "org/jetbrains/annotations/13.0" "annotations-13.0.jar"
baixar "org/json/json/20240303" "json-20240303.jar"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
javac -d "$TMP/stubs" $(find "$AQUI/stubs" -name "*.java")
CP=$(ls "$CACHE"/*.jar | tr '\n' ':')
java -cp "$CP" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib \
  -classpath "$CACHE/kotlin-stdlib-$V.jar:$CACHE/annotations-13.0.jar:$CACHE/json-20240303.jar:$TMP/stubs" \
  -d "$TMP/out" \
  "$SRC/main/java/br/com/rifa/pos/Terminal.kt" \
  "$SRC/main/java/br/com/rifa/pos/RetornoDeApp.kt" \
  "$SRC/ton/java/br/com/rifa/pos/TerminalStone.kt" \
  "$SRC/ton/java/br/com/rifa/pos/TerminalFactory.kt" \
  "$AQUI/TesteStone.kt"
java -Dfile.encoding=UTF-8 -cp "$TMP/out:$TMP/stubs:$CACHE/kotlin-stdlib-$V.jar:$CACHE/json-20240303.jar" TesteStoneKt
