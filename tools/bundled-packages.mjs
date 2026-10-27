import {realpathSync} from 'node:fs';
import {resolve} from 'node:path';

export const PACKAGE_LIST = '.vite/bundled-packages.json';

// Use the last node_modules segment so pnpm stores and nested dependencies retain their exact installed versions.
function packageDirectory(id, root) {
  const path = resolve(root, id.replace(/^\0/, '').split('?')[0]).replaceAll('\\', '/');
  const match = /^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)(?:\/|$)/.exec(path);
  return match ? realpathSync(match[1]) : null;
}

export function bundledPackagesPlugin(buildRuntime) {
  let root;
  return {
    name: 'bundled-packages',
    apply: 'build',
    configResolved(config) {
      root = config.root;
    },
    generateBundle(_, bundle) {
      const packages = new Set();
      for (const output of Object.values(bundle)) {
        const ids = output.type === 'chunk' ? Object.keys(output.modules) : output.originalFileNames;
        for (const id of ids) {
          const directory = packageDirectory(id, root);
          if (directory) packages.add(directory);
        }
      }
      this.emitFile({
        type: 'asset',
        fileName: PACKAGE_LIST,
        source: JSON.stringify({root, packages: [...packages].sort(), buildRuntime}, null, 2) + '\n'
      });
    }
  };
}
