#!/bin/sh
# Xcode Cloud post-clone step for the Co-Pack iOS app.
#
# Co-Pack is an Expo app inside an npm-workspaces monorepo. Xcode Cloud does a
# clean clone and runs xcodebuild, so before the native build (and its React
# Native "Bundle React Native code and images" phase) can run, we must:
#   1. have Node on PATH (the committed ios/.xcode.env resolves NODE_BINARY=$(command -v node))
#   2. install all workspace JS deps from the repo root (so @copack/engine + RN resolve)
#   3. install CocoaPods for the iOS project
#
# Xcode Cloud runs this from the ci_scripts directory and sets
# CI_PRIMARY_REPOSITORY_PATH to the cloned repo root.
set -e

echo "▸ Co-Pack ci_post_clone starting"
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1

# 1. Node (Xcode Cloud images do not preinstall it).
if ! command -v node >/dev/null 2>&1; then
  echo "▸ Installing Node via Homebrew…"
  brew install node
fi
echo "▸ node $(node -v) / npm $(npm -v)"

# 2. Workspace JS dependencies, installed from the monorepo root.
echo "▸ Installing JS dependencies (npm ci) at repo root…"
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm ci

# 3. CocoaPods for the iOS app.
if ! command -v pod >/dev/null 2>&1; then
  echo "▸ Installing CocoaPods via Homebrew…"
  brew install cocoapods
fi
echo "▸ pod install…"
cd "$CI_PRIMARY_REPOSITORY_PATH/packages/mobile/ios"
pod install

echo "▸ Co-Pack ci_post_clone complete"
