import {expect, it} from 'vitest';
import {readSubscriptionEntries, writeSubscriptionEntry} from '../../dae/subscriptions';
import {subscriptionChange} from './useSubscriptionEditor';
import type {ProviderForm} from './view';

const opened = "subscription {\n    paid: 'https://example.com/sub'\n}\n";
const [entry] = readSubscriptionEntries(opened);
const form: ProviderForm = {name: 'paid', value: 'https://example.com/sub', interval: '', agent: '', cache: null, route: ''};

it.each([
  ['nothing changed', {}, {}],
  ['a new interval only', {interval: '2h'}, {interval: 7200}],
  ['a rename only', {name: ' paid2 '}, {tag: 'paid2'}],
  ['a blank User-Agent', {agent: '  '}, {}],
  ['a new link only', {value: 'https://example.com/next'}, {url: 'https://example.com/next'}],
  ['a direct download route', {route: 'direct'}, {route: 'direct'}]
])('writes only what the dialog changed: %s', (_, edit, change) => {
  expect(subscriptionChange(entry, {...form, ...edit}, undefined)).toEqual(change);
});

it('keeps a link updated in the source meanwhile when only the interval changes', () => {
  const updated = opened.replace('/sub', '/rotated');
  const written = writeSubscriptionEntry(updated, 'paid', subscriptionChange(entry, {...form, interval: '2h'}, undefined));
  expect(readSubscriptionEntries(written)[0]).toMatchObject({url: 'https://example.com/rotated', interval: 7200});
});

it('writes an address typed without a scheme with https:// added', () => {
  const change = subscriptionChange(entry, {...form, value: ' next.example.com/sub?t=1 '}, undefined);
  expect(change).toEqual({url: 'https://next.example.com/sub?t=1'});
  expect(readSubscriptionEntries(writeSubscriptionEntry(opened, 'paid', change))[0].url).toBe('https://next.example.com/sub?t=1');
});
