import 'dotenv/config';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import path from 'node:path';
import fs from 'node:fs';

function copyNodePty(buildPath: string) {
  const src = path.join(__dirname, 'node_modules', 'node-pty');
  const dest = path.join(buildPath, 'node_modules', 'node-pty');
  fs.cpSync(src, dest, { recursive: true });

  // Ensure spawn-helper binaries are executable (npm ships them as 644)
  const prebuilds = path.join(dest, 'prebuilds');
  if (fs.existsSync(prebuilds)) {
    for (const dir of fs.readdirSync(prebuilds)) {
      const helper = path.join(prebuilds, dir, 'spawn-helper');
      if (fs.existsSync(helper)) {
        fs.chmodSync(helper, 0o755);
      }
    }
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: '**/node_modules/node-pty/**',
    },
    name: 'Termy',
    appBundleId: 'com.tree.termy',
    icon: './assets/icon',
    osxSign: {
      identity: process.env.CODESIGN_IDENTITY || '-',
    },
    extendInfo: {
      NSAppleEventsUsageDescription: 'Termy needs access to control other applications via Apple Events.',
    },
    afterCopy: [
      (buildPath, _electronVersion, _platform, _arch, callback) => {
        try {
          copyNodePty(buildPath);
          callback();
        } catch (err) {
          callback(err as Error);
        }
      },
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerZIP({}, ['darwin']),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
