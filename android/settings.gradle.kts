pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        // A SDK da PagBank e a da Stone são publicadas em repositórios
        // próprios. Acrescente aqui ao habilitar o sabor correspondente.
        // maven { url = uri("https://...") }
    }
}

rootProject.name = "rifa-pos"
include(":app")
