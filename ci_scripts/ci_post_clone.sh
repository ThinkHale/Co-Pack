#!/bin/sh

# Xcode Cloud post-clone script.
#
# `packages/mobile/ios/Pods/` is gitignored, so a fresh Xcode Cloud clone has no
# Pods directory — yet the Xcode project references files inside it (e.g.
# Pods-CoPack.release.xcconfig). Without regenerating them the build fails with:
#   "Unable to open base configuration reference file ...Pods-CoPack.release.xcconfig"
#
# This runs right after the clone, before xcodebuild: install the JS workspace
# deps (Expo autolinking reads node_modules to decide which native pods to add)
# and run `pod install` to regenerate Pods/ and its .xcconfig files.

set -e

# Scripts run from the ci_scripts directory; work from the repo root.
cd "$CI_PRIMARY_REPOSITORY_PATH"

# Node isn't preinstalled on Xcode Cloud images (CocoaPods usually is).
export HOMEBREW_NO_INSTALL_CLEANUP=1
brew install node
command -v pod >/dev/null 2>&1 || brew install cocoapods

# Install every workspace from the lockfile. The mobile app resolves
# @copack/engine from source through the workspace symlink, so the root
# install is required — not just packages/mobile.
npm ci

# Regenerate ios/Pods + the *.xcconfig files the Xcode project references.
cd packages/mobile/ios
pod install
