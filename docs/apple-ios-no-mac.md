# Apple iOS — No Mac (App Store Connect + cloud build)

All Apple setup is done in the browser. Building and uploading the iOS app is done by a **cloud Mac build service**, not on your own Mac.

---

## 1. Apple Developer (browser)

1. Go to [developer.apple.com/account](https://developer.apple.com/account) → **Certificates, Identifiers & Profiles**.
2. **Identifiers → App IDs → +**
   - Type: App.
   - Bundle ID: **com.dodi.app**.
   - Enable **Push Notifications**. Save.
3. **Keys → +** (for APNs)
   - Name: e.g. "Dodi APNs".
   - Enable **Apple Push Notifications service (APNs)**.
   - Continue → Register → **Download the .p8 file** once (you can't download it again). Note **Key ID** and **Team ID**.
4. **Certificates**
   - You need an **Apple Distribution** certificate for App Store.
   - Creating it usually requires a **Certificate Signing Request (CSR)** from a Mac. Options:
   - **Option A:** Use a **cloud build service** (see §4) that can create and manage the Distribution certificate for you (e.g. Codemagic, Bitrise, or GitHub Actions with a Mac runner and fastlane).
   - **Option B:** Borrow a Mac once (or a friend's): create the Distribution cert, download it, export cert + private key (e.g. .p12), then upload that to your cloud builder. After that you don't need the Mac for building.
5. **Profiles → +**
   - **Distribution → App Store Connect** (or App Store).
   - Select App ID **com.dodi.app**.
   - Select your Distribution certificate.
   - Name the profile (e.g. "Dodi App Store"), generate, **Download** the `.mobileprovision` file.
   - Upload this (and the signing identity) to your cloud build service.

---

## 2. Connect APNs to Firebase (browser)

1. Firebase Console → your project → **Project Settings** → **Cloud Messaging**.
2. Under **Apple app configuration**, upload your **APNs Authentication Key** (the .p8 file) and enter **Key ID** and **Team ID**.
   - This lets FCM send pushes to iOS without running Xcode.

---

## 3. App Store Connect (browser only)

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **My Apps** → **+** → **New App**.
2. Platform: **iOS**. Name: **dodi**. Bundle ID: **com.dodi.app**.
3. Fill in: description, keywords, support URL, **privacy policy URL** (e.g. your Vercel `/privacy`), category (e.g. Lifestyle), age rating (e.g. 12+).
4. Leave **Pricing** as Free.
5. You do **not** upload a build from your own machine; the **cloud build service** will upload the first build to this app record.

---

## 4. Build and upload without a Mac (cloud service)

Use a service that runs on **macOS** and runs Xcode to archive and upload. They integrate with **App Store Connect** and often with **Apple Developer** (certificates/profiles).

**Typical flow:**

1. **Pick a provider** (one of):
   - **Codemagic** (codemagic.io) — good for Capacitor; connects to repo; can create/manage Apple certs and profiles.
   - **Bitrise** (bitrise.io) — similar; add your repo and configure iOS workflow.
   - **GitHub Actions** — use a `macos-latest` runner; workflow runs `npm ci`, `npm run build`, `npx cap sync ios`, then builds and signs (e.g. `xcodebuild` + `xcrun altool` or fastlane). You supply signing cert + provisioning profile (or use fastlane match).

2. **Connect the repo**  
   Grant the service access to your Dodi repo (GitHub/GitLab/etc.).

3. **Configure signing**
   - **If the service manages certs:** Log in with your Apple ID; it can create the Distribution certificate and App Store profile.
   - **If you supply them:** Upload the Distribution certificate (e.g. .p12) and the App Store provisioning profile (.mobileprovision) from §1.

4. **Set env and secrets**  
   Add **FIREBASE_SERVICE_ACCOUNT_JSON** (and any other notify-server env) only if the build needs them; usually the **notify server** runs elsewhere (e.g. Vercel) and only needs that env there. The iOS app itself only needs the Firebase client config (`GoogleService-Info.plist` in the repo).

5. **Build and upload to App Store Connect**  
   Workflow: install deps → build web assets → `cap sync ios` → open Xcode project → archive → upload to App Store Connect (TestFlight).  
   In App Store Connect, the new build appears under **TestFlight** (and later under the app version for **App Store** release).

6. **TestFlight and release**  
   In App Store Connect → your app → **TestFlight**: add internal testers, then submit a build for **App Store** review when ready.

---

**Summary:** All Apple *configuration* is in developer.apple.com and appstoreconnect.apple.com. The actual *build and upload* is done by a cloud Mac service (Codemagic, Bitrise, or GitHub Actions with a Mac runner); you don't need a Mac as long as that service has access to your repo and to Apple (certificates/profiles and App Store Connect API).
