import {expect, it} from 'vitest';
import type {ApiEvent} from '../../api/model';
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
  expect(view.rows[0].timeTooltip).toBe(events[0].data.observed_at);
  expect(view.status.text).toBe(t('event.unavailable'));
  expect(eventsView(events, 'all', true, true, 200, 'en-US', t, ['stream.ready', 'runtime.updated']).rows.map(row => row.id)).toEqual(['ready', 'runtime']);
});

it('offers only advertised event kinds and resets an unsupported selection', () => {
  const view = eventsView([], 'flow.updated', true, true, 200, 'en-US', t, ['stream.ready', 'runtime.updated']);
  expect(view.kind).toBe('all');
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
