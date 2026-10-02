import {expect, it} from 'vitest';
import {historyView} from './history';
import {translate, type Translator} from '../../i18n';
import type {ConfigRevisionList} from '../../api/model';
const t: Translator = (key, params) => translate('en', key, params);
const list: ConfigRevisionList = {
  active: 2,
  max_revisions: 17,
  revisions: [2, 1].map(revision => ({
    revision,
    parent: revision === 2 ? 1 : null,
    created_at: '2026-01-01T00:00:00Z',
    principal: 'operator',
    origin: revision === 2 ? 'write' : 'future-origin',
    bytes: 1024,
    content_sha256: 'digest',
    sources: [{path: '<redacted>', sha256: 'source-digest'}]
  }))
};
it.each([true, false])('projects metadata and head independently of the opaque revision (recorded=%s)', recorded => {
  const store = {recorded};
  const view = historyView(list, store, true, 'en-US', t);
  expect(view.unrecorded).toBe(!recorded);
  expect(view.rows.map(row => [row.id, row.head, row.canRestore, row.originText])).toEqual([
    ['2', true, !recorded, 'Write'],
    ['1', false, true, 'future-origin']
  ]);
  expect(view.rows[0].metadata).toContainEqual(['Principal', 'operator']);
  expect(view.rows[0].sources).toEqual(list.revisions[0].sources);
  expect(historyView(list, store, false, 'en-US', t).rows.every(row => !row.canRestore)).toBe(true);
});
it('keeps absent history empty without claiming an unrecorded store', () => {
  expect(historyView(undefined, undefined, false, 'en-US', t)).toEqual({unrecorded: false, headNumber: undefined, rows: []});
});
it.each(['en-US', 'de-DE', 'zh-TW'])('formats the confirmation head like the revision title in %s', locale => {
  const revision = {...list.revisions[0], revision: 12345};
  const view = historyView({...list, active: 12345, revisions: [revision]}, undefined, true, locale, t, 12345);
  expect(view.headNumber).toBe(new Intl.NumberFormat(locale).format(12345));
  expect(view.headNumber).toBe(view.rows[0].number);
});
