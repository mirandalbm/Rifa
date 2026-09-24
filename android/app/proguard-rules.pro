# A ponte é chamada pelo JavaScript por nome: ofuscar apaga o contrato.
-keepclassmembers class br.com.rifa.pos.PosBridge {
    public *;
}
-keep class br.com.rifa.pos.PosBridge { *; }
