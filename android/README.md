# SonicSplit AI — Android App

## Setup

### Prerequisites
- Android Studio Ladybug (2024.2) or newer
- JDK 17+
- Android SDK API 35

### Steps to open & run

1. **Open in Android Studio**: `File → Open → e:/moises2/android/`
2. **Wait for Gradle sync** — it will download all dependencies automatically
3. **Connect a device** or start an emulator (API 26+)
4. **Run** with `⌃R` or click the green Play button

### Firebase SHA-1 (important for Google Sign-In)

You must add your debug SHA-1 key to the Firebase console:

```bash
# Get your debug SHA-1
./gradlew signingReport
```

Then go to: **Firebase Console → moises-17d22 → Project Settings → Your Android app → Add fingerprint**

---

## Architecture

```
com.juditht.ai/
├── SonicSplitApp.kt          ← Hilt Application
├── MainActivity.kt            ← Single activity, Compose host
├── di/
│   └── AppModule.kt          ← Hilt singletons (Retrofit, Room, Gson)
├── data/
│   ├── api/SonicSplitApiService.kt   ← Retrofit endpoints
│   ├── db/Database.kt                ← Room DB + DAO
│   ├── model/Models.kt               ← Data classes
│   └── repository/SeparationRepository.kt ← API + DB logic
└── ui/
    ├── theme/                 ← Sonic Neural design system
    ├── navigation/NavGraph.kt ← Compose Navigation
    ├── components/Components.kt ← GlassCard, SonicButton, etc.
    ├── auth/                  ← Login screen + ViewModel
    ├── library/               ← Library screen + ViewModel
    ├── upload/                ← Upload screen + ViewModel
    └── results/               ← Results/Processing screen + ViewModel
```

## Backend API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/separate-demucs` | Upload audio + start job |
| GET  | `/status/{task_id}`    | Poll job status |

Base URL: `https://moises2-production.up.railway.app`

## Design System

Follows the **Sonic Neural** spec from `stitch_ai_multitrack_separator/sticht/sonic_neural/DESIGN.md`:
- Background: `#050505` (near-black)
- Primary: `#ADC7FF` (Electric Blue)
- Secondary: `#EBB2FF` (Neon Purple)  
- Tertiary: `#2AE500` (Vibrant Green)
- Glassmorphism cards: `rgba(255,255,255,0.03)` + `backdrop-filter`
