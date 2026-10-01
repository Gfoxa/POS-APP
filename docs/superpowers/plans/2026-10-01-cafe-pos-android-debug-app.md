# Android Debug APK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an installable Android debug APK that opens the existing cafe POS on a tablet over the local Wi-Fi network.

**Architecture:** Add a Capacitor 8 Android WebView shell that loads the existing Next.js application from the development computer's LAN URL. Next.js, Auth.js, Prisma, and PostgreSQL remain on the computer; the APK contains neither business logic nor database credentials.

**Tech Stack:** Next.js 15.5.27, TypeScript, Node.js 22+, Capacitor 8.5.2, Android Gradle project, Android SDK API 36, Auth.js, Prisma, PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-10-01-cafe-pos-android-debug-app-design.md`

## Global Constraints

- Require Node.js 22 or newer for Capacitor 8.
- Pin `@capacitor/core`, `@capacitor/cli`, and `@capacitor/android` to 8.5.2.
- Require Android Studio 2025.2.1 or newer with its bundled JDK; Android SDK API 36 is already installed.
- The current host has Node 20.20.2 and no Android Studio/JDK; install the prerequisites before generating and building the APK.
- Keep Next.js and PostgreSQL running on the development computer; expose only the Next.js port to the tablet.
- Keep LAN HTTP enabled in the Android debug variant only; no release or Play Store package is in scope.
- Never copy `.env`, `DATABASE_URL`, or `NEXTAUTH_SECRET` into Android assets.
- Use the same LAN origin for the WebView URL and `NEXTAUTH_URL`; do not add broad Server Action origins.
- Do not hard-code the developer's LAN IP in tracked source.

## Review Focus

1. Missing or malformed `ANDROID_POS_URL`: fail with a clear configuration message; unit tests cover missing values and invalid protocols.
2. Tablet loopback URL: reject `localhost`, `127.0.0.1`, `::1`, and `0.0.0.0`; unit tests prove the validation.
3. URL leakage: verify generated Capacitor config contains only the configured app URL and never database/Auth secrets; inspect generated config and APK assets.
4. Cleartext traffic scope: verify merged debug manifest permits local HTTP while main/release manifest does not; inspect both Gradle manifest outputs.
5. Authentication and transaction origin: install on a physical tablet, sign in, save a draft, and complete a test checkout with page and Server Action requests using the configured LAN origin.
6. Computer/server unavailable: confirm the README explains that the tablet needs the same Wi-Fi and the computer, Next.js, and PostgreSQL running, with firewall troubleshooting.

---

### Task 1: Prepare the Android build tools

**Files:**
- No repository files.

- [ ] **Step 1: Install or select** Node.js 22 or newer and Android Studio 2025.2.1 or newer, using Android Studio's bundled JDK. The current computer has Node 20.20.2 and SDK API 36 but no Android Studio/JDK.
- [ ] **Step 2: Verify** `node --version` reports 22 or newer, Android Studio opens, its SDK Manager has API 36 and Build Tools 36.1.0, and the bundled JDK is selected.
- [ ] **Step 3: Verify** the Android tablet is running Android 7.0/API 24 or newer (Capacitor 8 minimum).

### Task 2: Validate the Android development URL

**Files:**
- Create: `src/lib/android/pos-url.ts`
- Test: `src/lib/android/pos-url.test.ts`

**Interfaces:**
- Produces: `parseAndroidPosUrl(value: string | undefined): string`; returns a normalized HTTP(S) origin with no trailing slash or throws a user-readable configuration error.

- [ ] **Step 1: Write failing URL validation tests** for a valid private LAN origin, missing value, unsupported protocol, loopback/wildcard host, embedded credentials, path, query, and fragment.
- [ ] **Step 2: Run** `npm test -- src/lib/android/pos-url.test.ts`; expect the tests to fail because the parser is absent.
- [ ] **Step 3: Implement** `parseAndroidPosUrl` using the built-in `URL` parser. Accept only HTTP(S), a host reachable by another device, and origin-only URLs.
- [ ] **Step 4: Run** `npm test -- src/lib/android/pos-url.test.ts`; expect every listed case to pass.

### Task 3: Add Capacitor and generate the Android project

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `capacitor.config.ts`
- Create: `android-web/index.html`
- Create: `android/**` through the Capacitor CLI
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `parseAndroidPosUrl` from Task 2.
- Produces: Capacitor app ID `com.kopisore.pos`, display name `Kopi Sore POS`, and Android project directory `android/`.

- [ ] **Step 1: Add** exact Capacitor 8.5.2 runtime/CLI/Android dependencies; update the project engine to Node.js `>=22.0.0`.
- [ ] **Step 2: Create** `android-web/index.html` as a minimal local fallback that tells the tester to set `ANDROID_POS_URL` and run the debug build.
- [ ] **Step 3: Create** `capacitor.config.ts` with the app ID, display name, `webDir: "android-web"`, and `server.url` only when `ANDROID_POS_URL` is present and validated by Task 2. Do not set `server.cleartext`; HTTP permission is controlled by Android's debug manifest in Task 4.
- [ ] **Step 4: Generate** the Android project with `npx cap add android` using Node.js 22.
- [ ] **Step 5: Ignore** local SDK path, Gradle build outputs, and generated config/assets that may contain the developer's LAN URL; keep Android source tracked.
- [ ] **Step 6: Run** `npx cap config` without a URL and with a sample LAN URL; confirm the app identity is stable, missing URL does not include a host, and supplied URLs are validated.
- [ ] **Step 7: Run** `npm run typecheck` and `npm run lint`; fix generated-file or config errors.

### Task 4: Restrict local HTTP to the debug Android build

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/debug/AndroidManifest.xml`

**Interfaces:**
- Consumes: validated server URL from Task 2 and Capacitor project from Task 3.
- Produces: debug-only permission for local HTTP; main/release manifest keeps cleartext disabled.

- [ ] **Step 1: Add** Internet permission to the main manifest and explicitly keep `android:usesCleartextTraffic="false"` in the main application configuration.
- [ ] **Step 2: Add** a debug manifest overlay setting `android:usesCleartextTraffic="true"`; do not change the main/release manifest to allow HTTP.
- [ ] **Step 3: Build** debug and release manifest-processing tasks in Android Studio/Gradle; inspect merged manifests to prove only debug permits HTTP.
- [ ] **Step 4: Run** `npx cap sync android` with `ANDROID_POS_URL` unset; inspect the generated Capacitor config and confirm it contains no development URL before any release build.
- [ ] **Step 5: Run** `npx cap sync android` with a LAN URL; confirm generated config contains that URL and no database/Auth secrets.
- [ ] **Step 6: Run** `npm test -- src/lib/android/pos-url.test.ts` and commit the manifest/config changes.

### Task 5: Document setup and build the test APK

**Files:**
- Modify: `README.md`
- Android build output: `android/app/build/outputs/apk/debug/app-debug.apk` (ignored)

- [ ] **Step 1: Document** prerequisites, finding the computer's private LAN IP, setting `NEXTAUTH_URL` and `ANDROID_POS_URL` to that address, and restarting the development server.
- [ ] **Step 2: Document** starting PostgreSQL and Next.js bound to `0.0.0.0`, allowing port 3000 only on the private network, running `npx cap sync android`, and building `assembleDebug` in Android Studio.
- [ ] **Step 3: Document** installing the APK via USB/ADB or copying it to the tablet, signing in with the local demo owner account, and troubleshooting same-Wi-Fi, firewall, stale-IP, and stopped-server failures.
- [ ] **Step 4: Run** `npm run lint`, `npm run typecheck`, and `npm test`.
- [ ] **Step 5: Build** the debug APK in Android Studio; confirm the artifact exists at the documented path and inspect its merged debug manifest.
- [ ] **Step 6: Inspect** APK/config contents to confirm no database credentials or Auth.js secret are bundled.
- [ ] **Step 7: Commit** README and Android build-flow changes.

### Task 6: Physical tablet acceptance

**Files:**
- No source changes unless a reproducible defect is found.

- [ ] **Step 1: Start** PostgreSQL and the POS server on the computer with `NEXTAUTH_URL` set to its private LAN origin and Next.js bound to `0.0.0.0`.
- [ ] **Step 2: Install** `app-debug.apk` on the Android tablet, connected to the same Wi-Fi.
- [ ] **Step 3: Verify** login, role-restricted navigation, POS product search, saving a draft, completing a test cash checkout, and viewing its receipt.
- [ ] **Step 4: Verify** the tablet shows the documented connection failure when the server is stopped, then reconnects after the server is restarted.
- [ ] **Step 5: Record** device-specific issues and fix them before delivery; do not publish or push a release build.
