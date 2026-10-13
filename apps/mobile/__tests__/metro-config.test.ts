/* eslint-disable @typescript-eslint/no-require-imports */
// Unit test of our metro.config.js additions. Expo's getDefaultConfig is mocked: loading the real
// Metro config inside the jest-expo (react-native) environment pulls browser-only ESM builds.
// The real config is exercised by `expo export` / `expo config` (design §16.2).

declare const __dirname: string;

type ResolveRequest = (ctx: unknown, moduleName: string, platform: string | null) => unknown;
type MetroConfig = {
  resolver: { resolveRequest: ResolveRequest; blockList: RegExp[] };
  watchFolders: string[];
};

const pathLib = require('path') as {
  resolve: (...p: string[]) => string;
  join: (...p: string[]) => string;
};

let mockUpstream: ResolveRequest | undefined;
jest.mock('expo/metro-config', () => ({
  getDefaultConfig: () => ({
    watchFolders: [],
    resolver: { resolveRequest: mockUpstream, blockList: [] },
  }),
}));

function loadConfig(): MetroConfig {
  let config: MetroConfig | undefined;
  jest.isolateModules(() => {
    config = require('../metro.config') as MetroConfig;
  });
  return config!;
}

describe('metro.config resolveRequest', () => {
  const workspaceRoot = pathLib.resolve(__dirname, '..', '..', '..');

  beforeEach(() => {
    mockUpstream = undefined;
  });

  it('maps @belzo/shared to the shared source entry', () => {
    const config = loadConfig();
    const ctx = { resolveRequest: jest.fn() };
    expect(config.resolver.resolveRequest(ctx, '@belzo/shared', 'android')).toEqual({
      type: 'sourceFile',
      filePath: pathLib.join(workspaceRoot, 'packages', 'shared', 'src', 'index.ts'),
    });
    expect(ctx.resolveRequest).not.toHaveBeenCalled();
  });

  it('delegates any other module to ctx.resolveRequest with the same arguments', () => {
    const config = loadConfig();
    const resolved = { type: 'sourceFile', filePath: '/x/zod/index.js' };
    const ctx = { resolveRequest: jest.fn(() => resolved) };
    expect(config.resolver.resolveRequest(ctx, 'zod', 'android')).toBe(resolved);
    expect(ctx.resolveRequest).toHaveBeenCalledWith(ctx, 'zod', 'android');
  });

  it('prefers the upstream resolver when Expo defines one', () => {
    const upstream = jest.fn(() => 'upstream');
    mockUpstream = upstream;
    const config = loadConfig();
    const ctx = { resolveRequest: jest.fn() };
    expect(config.resolver.resolveRequest(ctx, 'zod', 'android')).toBe('upstream');
    expect(upstream).toHaveBeenCalledWith(ctx, 'zod', 'android');
    expect(ctx.resolveRequest).not.toHaveBeenCalled();
  });

  it('does not map sub-paths of @belzo/shared', () => {
    const config = loadConfig();
    const ctx = { resolveRequest: jest.fn(() => null) };
    config.resolver.resolveRequest(ctx, '@belzo/shared/dist/index.js', 'android');
    expect(ctx.resolveRequest).toHaveBeenCalledWith(ctx, '@belzo/shared/dist/index.js', 'android');
  });

  it('watches the workspace root and blocks server build output', () => {
    const config = loadConfig();
    expect(config.watchFolders).toContain(workspaceRoot);
    const blocked = (p: string) => config.resolver.blockList.some((re) => re.test(p));
    expect(blocked(pathLib.join(workspaceRoot, 'apps', 'web', '.next', 'server', 'x.js'))).toBe(
      true,
    );
    expect(blocked(pathLib.join(workspaceRoot, 'apps', 'api', 'dist', 'main.js'))).toBe(true);
    expect(blocked(pathLib.join(workspaceRoot, 'apps', 'api', 'uploads', 'a.jpg'))).toBe(true);
    expect(blocked(pathLib.join(workspaceRoot, 'packages', 'shared', 'src', 'index.ts'))).toBe(
      false,
    );
  });
});
