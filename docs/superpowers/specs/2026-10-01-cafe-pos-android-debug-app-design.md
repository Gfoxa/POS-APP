# Android Debug App Design

## Goal

Let the cafe owner install and test the existing POS on an Android tablet without rewriting the application or moving its database.

## Existing system

- The POS is a Next.js 15 App Router application with server-rendered pages.
- Authentication uses Auth.js Credentials with JWT sessions stored through web cookies.
- Mutations and operational reads use Next.js Server Actions and Prisma.
- PostgreSQL and the Next.js server run on the development computer.
- The repository has no Android project, Capacitor setup, PWA manifest, or service worker.
- Android SDK platform 36.1 and build tools 36.1.0 are present on the host.

## Proposed architecture

Add a Capacitor Android shell under `android/` that loads the existing POS from a configurable development URL such as `http://<computer-lan-ip>:3000`. The Next.js server remains the application backend and Prisma continues to connect to PostgreSQL on the computer. The APK contains no database credentials or cafe data.

Configure the development URL through an environment variable such as `ANDROID_POS_URL`; do not hard-code a developer's LAN address. The release configuration must omit the development URL.

## Authentication and request security

The tablet uses the existing login page and Auth.js cookie session in its WebView. The computer's `NEXTAUTH_URL` must match the LAN URL used by the tablet. The Next.js page and Server Action requests remain on the same host, so no broad `allowedOrigins` exception is planned.

Allow cleartext HTTP only in the debug Android variant for same-Wi-Fi testing. Release configurations require HTTPS. Do not expose PostgreSQL to the LAN; only the Next.js web port is reachable from the tablet.

## Local test flow

1. Start PostgreSQL and the Next.js development server on the computer; bind Next.js to `0.0.0.0`.
2. Set `NEXTAUTH_URL` and `ANDROID_POS_URL` to the computer's current private LAN address.
3. Allow port 3000 through the computer firewall on the private network.
4. Build and install the debug APK on an Android tablet on the same Wi-Fi.
5. Sign in with a local demo account and exercise POS, orders, tables, and kitchen flows against the existing database.

The computer, server, and database must remain running. Offline use is not supported. The local HTTP setup is for development testing only.

## Build and delivery

Produce a debug APK at `android/app/build/outputs/apk/debug/app-debug.apk` and document the build, install, LAN URL, login, and troubleshooting steps in the README. Do not configure a Play Store release or production signing in this phase.

## Out of scope

- A native Kotlin rewrite of the POS UI.
- Replacing Server Actions with a public REST API.
- Bundling PostgreSQL or cafe data into the APK.
- Offline operation, Play Store publication, or production distribution.

## Risks and limitations

- The computer's LAN IP can change; the debug URL must be updated before rebuilding.
- The firewall or Wi-Fi client isolation can prevent tablet access.
- Authentication depends on the tablet continuing to use the same LAN origin.
- Debug HTTP must not be used outside the trusted local test network.
