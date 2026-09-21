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
  const view = eventsView(events, 'stream.ready', false, false, 200, 'en-US', t);
  expect(view.rows.map(row => row.id)).toEqual(['ready']);
  expect(JSON.parse(eventsExport(view.shown))).toEqual([events[0]]);
  expect(view.rows[0].timeTooltip).toBe(events[0].data.observed_at);
  expect(view.status.text).toBe(t('event.unavailable'));
  expect(eventsView(events, 'all', true, true, 200, 'en-US', t).rows.map(row => row.id)).toEqual(['ready', 'runtime']);
});
