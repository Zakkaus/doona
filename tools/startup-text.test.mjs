import {expect, it} from 'vitest';
import {languages} from './languages.mjs';
import {startupTextPlugin, startupTexts} from './startup-text.mjs';
import generated from 'virtual:startup-text';

it('emits only startup messages from registered catalogues and reflects edits', () => {
  let failure = 'Local failure';
  const read = path =>
    JSON.stringify({'ui.interfaceTextUnavailable': path.includes('/en.json') ? 'English failure' : failure, 'ui.retry': 'Try again', other: 'excluded'});
  const plugin = startupTextPlugin(read);
  const watched = [];
  const load = () => plugin.load.call({addWatchFile: path => watched.push(path)}, '\0virtual:startup-text');
  expect(JSON.parse(load().slice('export default '.length, -1))).toEqual(
    Object.fromEntries(languages.map(({id}) => [id, [id === 'en' ? 'English failure' : 'Local failure', 'Try again']]))
  );
  expect(watched).toHaveLength(languages.length);
  failure = 'Edited failure';
  expect(JSON.parse(load().slice('export default '.length, -1))['zh-TW'][0]).toBe('Edited failure');
  expect(plugin.resolveId('virtual:startup-text')).toBe('\0virtual:startup-text');
  const invalidated = [];
  const messages = [];
  let changed;
  plugin.configureServer({
    watcher: {on: (_, callback) => (changed = callback)},
    moduleGraph: {getModuleById: () => 'startup-module', invalidateModule: module => invalidated.push(module)},
    ws: {send: message => messages.push(message)}
  });
  changed(watched[0]);
  expect(invalidated).toEqual(['startup-module']);
  expect(messages).toEqual([{type: 'full-reload'}]);
});

it('uses English separately for each missing key in a partial catalogue', () => {
  const entries = {
    en: {'ui.interfaceTextUnavailable': 'English failure', 'ui.retry': 'Retry'},
    fr: {'ui.retry': 'Réessayer'}
  };
  const read = path => JSON.stringify(entries[path.endsWith('/en.json') ? 'en' : 'fr']);
  expect(startupTexts([{id: 'en'}, {id: 'fr'}], read)).toEqual({en: ['English failure', 'Retry'], fr: ['English failure', 'Réessayer']});
});

it('serves the catalogue text through the Vitest config', () => {
  expect(generated).toEqual(startupTexts());
  expect(generated.en).toEqual(['The interface text could not be loaded.', 'Retry']);
});
