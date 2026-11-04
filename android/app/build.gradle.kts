plugins { id("com.android.application") }
android {
    namespace = "io.appxray.client"
    compileSdk = 35
    defaultConfig {
        applicationId = "io.appxray.client"
        minSdk = 24
        targetSdk = 35
        versionCode = 5
        versionName = "0.3.1"
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_1_8; targetCompatibility = JavaVersion.VERSION_1_8 }
}
