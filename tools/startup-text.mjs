import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {languages, REFERENCE_LANG} from './languages.mjs';

// The failure screen shows when no catalogue loads, so its text cannot come from one at run time. The virtual module
// `virtual:startup-text` carries just these keys for every registered language, read from the catalogues at build,
// with the reference text for a key a partial catalogue lacks.
export const startupKeys = ['ui.interfaceTextUnavailable', 'ui.retry'];
const file = id => fileURLToPath(new URL(`../src/i18n/locales/${id}.json`, import.meta.url));

export function startupTexts(list = languages, read = path => readFileSync(path, 'utf8')) {
  const catalogues = Object.fromEntries(list.map(({id}) => [id, JSON.parse(read(file(id)))]));
  return Object.fromEntries(
    list.map(({id}) => [
      id,
      startupKeys.map(key => {
        const value = catalogues[id][key] ?? catalogues[REFERENCE_LANG][key];
        if (typeof value !== 'string' || !value) throw new Error(`${id}: missing startup text ${key}`);
        return value;
      })
    ])
  );
}

// Vite and Vitest both use it. A catalogue edit in dev reloads the page with the new text.
export function startupTextPlugin(read) {
  const id = '\0virtual:startup-text';
  const files = languages.map(language => file(language.id));
  return {
    name: 'startup-text',
    resolveId(source) {
      if (source === 'virtual:startup-text') return id;
    },
    load(source) {
      if (source !== id) return;
      for (const path of files) this.addWatchFile(path);
      return `export default ${JSON.stringify(startupTexts(languages, read))};`;
    },
    configureServer(server) {
      server.watcher.on('change', path => {
        if (!files.includes(path)) return;
        const module = server.moduleGraph.getModuleById(id);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({type: 'full-reload'});
      });
    }
  };
}
