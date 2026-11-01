import {expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ActivityCard} from './ActivityCard';
import {LangContext, translate} from '../../i18n';
import {SettingsContext} from '../../shell/preferences';
import type {ComponentProps} from 'react';

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
  // Counting the features that are off links to the card that lists them.
  expect(links[0][0]).toContain(count ? 'href="#/overview?card=limits"' : 'href="#/overview"');
  expect(links[0][1]).toBe(state.limited ?? translate('en', 'act.viewDetails'));
});

it('status shows View details instead of the count when the notice is off', () => {
  state.limited = translate('en', 'act.limited', {n: 3});
  const settings = {ap: {limitNotice: false}} as unknown as NonNullable<ComponentProps<typeof SettingsContext.Provider>['value']>;
  const markup = renderToStaticMarkup(
    <LangContext.Provider value="en">
      <SettingsContext.Provider value={settings}>
        <ActivityCard item={{id: 'status'}} />
      </SettingsContext.Provider>
    </LangContext.Provider>
  );
  expect([...markup.matchAll(/<a\b[^>]*>(.*?)<\/a>/gs)].map(link => link[1])).toEqual([translate('en', 'act.viewDetails')]);
});
