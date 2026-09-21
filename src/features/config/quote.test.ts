import {expect, it} from 'vitest';
import {quote, unquote} from './blocks';
import {addNamesToGroup, namedIn, readGroupEntries} from './groups';
import {readState, writeState} from './wizard';
import {writeInterval} from '../nodes/subscriptions';
import {LocalError} from '../../api/error';

it('preserves representable names and URLs without decoding backslashes', () => {
  const name = 'edge "west" \\ path';
  expect(unquote(quote(name))).toBe(name);
  const out = addNamesToGroup('group { proxy {} }', 'proxy', [name]);
  expect(namedIn(readGroupEntries(out)[0])).toEqual([name]);
  const url = 'https://example.org/{#}?token=a\\b';
  const text = `subscription {\n  paid: '${url}'\n}\ngroup { proxy {} }\n`;
  expect(writeInterval(text, 'paid', 3600)).toContain(`url: '${url}'`);
  expect(writeState(text, {...readState(text), subscriptions: [{name: 'paid', url}]})).toBe(text);
});

it('refuses apostrophes instead of silently changing group names or subscription URLs', () => {
  const url = "https://example.org/o'brien";
  expect(() => quote("o'brien")).toThrowError(new LocalError('config.unquotable'));
  expect(() => addNamesToGroup('group { proxy {} }', 'proxy', ["o'brien"])).toThrowError(LocalError);
  expect(() => writeInterval(`subscription {\n  paid: "${url}"\n}`, 'paid', 3600)).toThrowError(LocalError);
  expect(() => writeState('', {subscriptions: [{name: 'paid', url}], group: null, rules: 'keep', lanInterface: ''})).toThrowError(LocalError);
});
