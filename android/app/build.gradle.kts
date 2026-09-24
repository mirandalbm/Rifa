plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "br.com.rifa.pos"
    compileSdk = 34

    defaultConfig {
        applicationId = "br.com.rifa.pos"
        // Os terminais Smart rodam Android 7.1–9: a SDK da PagBank suporta
        // API 25 a 28, e é esse o piso que manda aqui.
        minSdk = 25
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

        buildConfigField(
            "String",
            "APP_URL",
            "\"${project.findProperty("rifa.appUrl") ?: "https://rifa.br"}\"",
        )
    }

    buildFeatures {
        buildConfig = true
    }

    /**
     * Um sabor por adquirente. `generico` compila sem nenhuma SDK e serve
     * para rodar em celular comum ou emulador — a ponte existe, só responde
     * que não há maquininha. Os outros dois só compilam depois que a SDK da
     * adquirente entra no bloco de dependências abaixo.
     */
    flavorDimensions += "adquirente"
    productFlavors {
        create("generico") {
            dimension = "adquirente"
            versionNameSuffix = "-generico"
        }
        create("pagbank") {
            dimension = "adquirente"
            versionNameSuffix = "-pagbank"
        }
        create("ton") {
            dimension = "adquirente"
            versionNameSuffix = "-ton"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
    // lifecycleScope e onBackPressedDispatcher vêm daqui — chegariam por
    // transitividade, mas depender disso quebra na primeira atualização.
    implementation("androidx.activity:activity-ktx:1.9.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // Descomente ao habilitar o sabor, com a versão que a adquirente indicar:
    // "pagbankImplementation"("br.com.uol.pagseguro.plugpagservice:wrapper:<versao>")
    // "tonImplementation"("br.com.stone:stone-sdk:<versao>")
}
