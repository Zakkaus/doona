import {expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ActivityCard} from './ActivityCard';
import {LangContext, translate} from '../../i18n';

const state = vi.hoisted(() => ({limited: null as string | null}));
vi.mock('./useActivity', () => ({
  useActivity: () => ({ready: true, status: {tone: 'ok', text: 'Running'}, limited: state.limited})
}));

it.each([0, 1, 7])('status offers one overview link with %i features off', count => {
  state.limited = count ? translate('en', 'act.limited', {n: count}) : null;
  const markup = renderToStaticMarkup(
    <LangContext.Provider value="en">
      <ActivityCard item={{id: 'status'}} />
    </LangContext.Provider>
  );
  const links = [...markup.matchAll(/<a\b[^>]*>(.*?)<\/a>/gs)];
  expect(links).toHaveLength(1);
  expect(links[0][0]).toContain('href="#/overview"');
  expect(links[0][1]).toBe(state.limited ?? translate('en', 'act.viewDetails'));
});
