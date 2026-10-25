import {expect, it} from 'vitest';
import {translate, type Translator} from '../../i18n';
import {parseNodeLinks} from './batch';
const t: Translator = (key, params) => translate('en', key, params);

it('trims lines, decodes fragments and makes derived names unique', () => {
  const result = parseNodeLinks(
    '  vless://id@host#Hong%20Kong \r\n\nss://key@server:443\nvless://id@host#Hong%20Kong',
    ['Hong Kong', 'Hong Kong-2', 'server'],
    t
  );
  expect(result.multiple).toBe(true);
  expect(result.rows.map(row => [row.name, row.scheme, row.error])).toEqual([
    ['Hong Kong-3', 'vless', null],
    ['server-2', 'ss', null],
    ['Hong Kong-4', 'vless', null]
  ]);
});
it('falls back to the host for empty or malformed fragments and reports unsupported links', () => {
  const result = parseNodeLinks('vless://id@host#%ZZ\nvless://id@host#\nwrong://host', [], t, ['vless']);
  expect(result.rows.map(row => row.name)).toEqual(['host', 'host-2', 'host-3']);
  expect(result.rows[2].error).toBe(t('nodes.linkInvalid'));
  expect(parseNodeLinks('\n vless://host \n', [], t).multiple).toBe(false);
});
it('accepts 200 non-empty lines and rejects 201', () => {
  const links = Array(200).fill('vless://host').join('\n');
  expect(parseNodeLinks(links, [], t).error).toBeNull();
  expect(parseNodeLinks(links + '\n\n', [], t).rows).toHaveLength(200);
  expect(parseNodeLinks(links + '\nvless://host', [], t).error).toBe(t('nodes.batchLimit'));
});

it.each(['en', 'zh-TW', 'zh-CN'] as const)('keeps full errors with short preview reasons in %s', locale => {
  const local: Translator = (key, params) => translate(locale, key, params);
  const result = parseNodeLinks(['wrong://host', "vless://id@host#can't", `vless://host#${'a'.repeat(8192)}`, 'vless://id@host#valid'].join('\n'), [], local, [
    'vless'
  ]);
  expect(result.rows.map(row => [row.errorSummary, row.error])).toEqual([
    [local('nodes.batchLinkInvalid'), local('nodes.linkInvalid')],
    [local('nodes.batchUnquotable'), local('config.unquotable')],
    [local('nodes.batchLinkTooLong'), local('nodes.linkTooLong', {n: 8192})],
    [null, null]
  ]);
});
