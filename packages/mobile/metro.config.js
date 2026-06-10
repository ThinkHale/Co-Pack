// Metro config for the Co-Pack mobile app living inside the npm-workspaces monorepo.
// Two jobs:
//   1. Let Metro watch + transpile the shared engine package, which lives outside
//      this project dir and is plain TypeScript (consumed from source, never built).
//   2. Resolve hoisted deps (react, react-native, ...) from the workspace root
//      node_modules as well as the local one.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole monorepo so changes to @copack/engine hot-reload.
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from both the local and the hoisted root node_modules.
// Hierarchical lookup stays ON (the default) so Metro can still walk into a
// dependency's own nested node_modules — npm workspaces don't hoist everything
// (e.g. expo-asset lives under expo/node_modules), and disabling it breaks those.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Map @copack/engine directly to its TypeScript source. Metro transpiles it via
// babel-preset-expo just like app code, so there is no build step for the engine.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  '@copack/engine': path.resolve(workspaceRoot, 'packages/engine/src'),
};

module.exports = config;
