import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {GeoResults} from './GeoResults';
import {LangContext} from '../../i18n';
import type {GeodataCard} from './view';

const card = (rows: number): GeodataCard => ({
  id: 'show:test',
  title: 'geosite:test',
  fields: [['Entries', String(rows)]],
  empty: 'No answers',
  rows: Array.from({length: rows}, (_, index) => ({id: String(index), code: null, type: 'domain', value: `d${index}.example`, attrs: ''}))
});

// The pager label is asserted in English; the default test language is zh-TW.
const render = (cards: GeodataCard[]) =>
  renderToStaticMarkup(
    <LangContext.Provider value="en">
      <GeoResults cards={cards} onShow={() => {}} />
    </LangContext.Provider>
  );

it('pages a long listing at 500 rows', () => {
  const markup = render([card(1200)]);
  expect(markup).toContain('d499.example');
  expect(markup).not.toContain('d500.example');
  expect(markup).toContain('Page 1 of 3');
});

it('shows no pager when the listing fits on one page', () => {
  const markup = render([card(10)]);
  expect(markup).toContain('d9.example');
  expect(markup).not.toContain('Page 1 of');
});

it('renders nothing without cards', () => {
  expect(render([])).toBe('');
});
