import {expect, it} from 'vitest';
import type {ApiEvent} from '../../api/model';
import {localTime} from '../../i18n/format';
import {translate, type Translator} from '../../i18n';
import {eventsExport, eventsView} from './view';
const t: Translator = (key, params) => translate('en', key, params);

it('exports only the selected event kind while preserving raw data', () => {
  const events: ApiEvent[] = [
    {id: 'ready', event: 'stream.ready', data: {instance_id: 'instance', observed_at: '2026-01-01T00:00:00Z'}},
    {id: 'runtime', event: 'runtime.updated', data: {instance_id: 'instance', observed_at: '2026-01-01T00:00:01Z', href: '/api/v1/runtime'}}
  ];
  const view = eventsView(events, 'stream.ready', false, false, 200, 'en-US', t, ['stream.ready', 'runtime.updated']);
  expect(view.rows.map(row => row.id)).toEqual(['ready']);
  expect(JSON.parse(eventsExport(view.shown))).toEqual([events[0]]);
  expect(view.rows[0].timestamp).toBe(localTime(events[0].data.observed_at, 'en-US'));
  expect(view.status.text).toBe(t('event.unavailable'));
  expect(eventsView(events, 'all', true, true, 200, 'en-US', t, ['stream.ready', 'runtime.updated']).rows.map(row => row.id)).toEqual(['ready', 'runtime']);
});

it('offers only advertised event kinds and resets an unsupported selection', () => {
  const view = eventsView([], 'flow.updated', true, true, 200, 'en-US', t, ['stream.ready', 'runtime.updated']);
  expect(view.kind).toBe('all');
  expect(eventsView([], 'all', false, true, 200, 'en-US', t, [], true).status.text).toBe(t('event.disconnected'));
  expect(view.kinds.map(item => item.id)).toEqual(['without-runtime', 'all', 'stream.ready', 'runtime.updated']);
});

it('filters runtime updates before limiting the default view and its export', () => {
  const data = {instance_id: 'instance', observed_at: '2026-01-01T00:00:00Z'};
  const ready: ApiEvent = {id: 'ready', event: 'stream.ready', data};
  const events: ApiEvent[] = [
    ...Array.from({length: 201}, (_, id): ApiEvent => ({id: String(id), event: 'runtime.updated', data: {...data, href: '/api/v1/runtime'}})),
    ready
  ];
  const view = eventsView(events, 'without-runtime', true, true, 200, 'en-US', t, ['stream.ready', 'runtime.updated']);
  expect(view.rows.map(row => row.id)).toEqual(['ready']);
  expect(JSON.parse(eventsExport(view.shown))).toEqual([ready]);
});

it('says on the ready row after lost history that events are missing', () => {
  const data = {instance_id: 'instance', observed_at: '2026-01-01T00:00:00Z'};
  const lost: ApiEvent = {id: 'ready:2', event: 'stream.ready', data};
  const resumed: ApiEvent = {id: 'ready:1', event: 'stream.ready', data};
  const view = eventsView([lost, resumed], 'all', true, true, 200, 'en-US', t, ['stream.ready'], false, event => event === lost);
  expect(view.rows.map(row => row.summary)).toEqual([t('event.lostHistory'), 'instance']);
});
