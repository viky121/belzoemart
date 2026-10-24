const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const sharedEntry = path.join(workspaceRoot, 'packages', 'shared', 'src', 'index.ts');
const config = getDefaultConfig(projectRoot); // SDK 57 auto-detects the pnpm workspace (watchFolders, nodeModulesPaths)
config.watchFolders = Array.from(new Set([...(config.watchFolders ?? []), workspaceRoot]));
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) =>
  moduleName === '@belzo/shared'
    ? { type: 'sourceFile', filePath: sharedEntry }
    : (upstream ?? context.resolveRequest)(context, moduleName, platform);
const esc = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [].concat(config.resolver.blockList ?? [], [
  new RegExp(`${esc(path.join(workspaceRoot, 'apps', 'web', '.next'))}[\\\\/].*`),
  new RegExp(`${esc(path.join(workspaceRoot, 'apps', 'api', 'dist'))}[\\\\/].*`),
  new RegExp(`${esc(path.join(workspaceRoot, 'apps', 'api', 'uploads'))}[\\\\/].*`),
]);
module.exports = config;
