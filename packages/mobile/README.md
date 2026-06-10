# Co-Pack Mobile (`@copack/mobile`)

The iOS + Android build of Co-Pack. Expo (SDK 56) + React Native. It consumes the
shared `@copack/engine` straight from TypeScript source (no build step) and rebuilds
the full web feature set with a native, touch-first UI.

## What's here

- **Full parity with the web demo:** Floor (morning standup, conditions + break-glass
  levers, animated lines, tap-to-assign stations + support slots, crew bench, train /
  terminate, mid-shift challenges, last-shift impact), Orders (hero contract, backlog,
  animated facility, objectives, event feed), Staffing (labor board + history, pay-rate
  slider, skill requests, standing programs), Office (lines + automation, leads &
  conversions).
- **Tap-to-assign** replaces the web's drag-and-drop: tap a bench worker, then tap a
  station — a sticky "Placing …" bar cues the second tap.
- **Persistence + offline catch-up** via AsyncStorage (mirrors the web localStorage
  flow): autosaves every 3s and on backgrounding; replays the sim through time away.
- **Feedback** uses haptics (expo-haptics) in place of the web's WebAudio blips, same
  `playSound()` API + sound toggle. Audio SFX files can be layered in later without
  touching callers.

## Run it locally (fastest path)

```bash
npm install            # from the repo root — installs all workspaces
npm run dev:mobile     # = expo start; press i / a, or scan the QR with Expo Go
```

Engine edits hot-reload (Metro watches the whole monorepo — see `metro.config.js`).

## Distribution — TestFlight + Google Play Internal

Test builds are produced and submitted with **EAS** (Expo Application Services). The
project is fully configured (`eas.json`, `app.json` with bundle IDs); the steps below
require **your** developer accounts and only need to be done once for setup.

Prereqs (one time):
- An [Expo account](https://expo.dev) — `npx eas login`
- **iOS:** Apple Developer Program membership ($99/yr)
- **Android:** Google Play Developer account ($25 one-time)

### 1. Link the EAS project
```bash
cd packages/mobile
npx eas init        # creates the project, fills extra.eas.projectId in app.json
```
(Replace the `REPLACE_WITH_EAS_PROJECT_ID` placeholder — `eas init` does this for you.)

### 2. Build
```bash
npx eas build --profile production --platform ios       # → .ipa for TestFlight
npx eas build --profile production --platform android    # → .aab for Play
# or both at once:
npx eas build --profile production --platform all
```
EAS will offer to generate iOS signing certs / an Android keystore for you — say yes
unless you have existing ones.

### 3. Submit to the test tracks
First fill in the placeholders in `eas.json` → `submit.production`:
- iOS: `appleId`, `ascAppId` (App Store Connect app ID), `appleTeamId`. Create the app
  record in [App Store Connect](https://appstoreconnect.apple.com) first.
- Android: a Play service-account JSON key at `./play-service-account.json` (see
  [Expo's guide](https://docs.expo.dev/submit/android/)); the `internal` track is set.

```bash
npx eas submit --profile production --platform ios       # → TestFlight
npx eas submit --profile production --platform android    # → Play internal testing
```

Then add testers in App Store Connect (TestFlight) and Play Console (internal testing).

### Quick device test without store accounts
`preview` profile builds an installable internal build (iOS needs registered device
UDIDs; Android produces a plain APK):
```bash
npx eas build --profile preview --platform android   # APK you can sideload immediately
```

## Distribution — Xcode Cloud (alternative to EAS for iOS)

The repo is prepped for Xcode Cloud: the native `ios/` project is committed and
`ios/ci_scripts/ci_post_clone.sh` installs Node + workspace JS deps (`npm ci` at the
monorepo root) + CocoaPods on each clean clone, so the React Native bundle phase
resolves `@copack/engine`. Pods/build artifacts stay gitignored.

Creating the workflow is a one-time GUI step (needs your Apple Developer account):

1. Open `ios/CoPack.xcworkspace` in Xcode; sign in under **Xcode ▸ Settings ▸ Accounts**
   with the team that owns `com.thinkhale.copack`.
2. **Product ▸ Xcode Cloud ▸ Create Workflow** → pick the **CoPack** scheme.
3. Grant Xcode Cloud access to the `ThinkHale/Co-Pack` GitHub repo when prompted
   (installs the Xcode Cloud GitHub app).
4. Configure: **Branch** = the branch you push (e.g. `mobile-xcode-cloud` or `main`);
   **Action** = Archive (iOS, Release); add a **TestFlight (Internal Testing)**
   post-action. Xcode can create the App Store Connect app record for the bundle id.
5. Save — the first build starts automatically and runs `ci_post_clone.sh`. After this,
   every push to the watched branch triggers a build.

If a CI build fails on the clone/deps step, the fix goes in `ci_post_clone.sh` (push to
the branch to re-trigger).

## Notes / next steps

- App icon + splash are generated from `Co-Pack Logo.png` / `Co-Pack Splash.png`.
- Bundle IDs: `com.thinkhale.copack` (iOS + Android). Version `0.1.0`, build/version
  code `1` — bump in `app.json` (or let the `production` profile `autoIncrement`).
- The native UI is hand-built (no per-screen drag); the engine remains the single
  source of truth, unchanged.
