import {renderToStaticMarkup} from 'react-dom/server';
import {expect, it} from 'vitest';
import {LangContext} from '../../i18n';
import {ScatterLegend, type ScatterPoint} from './Scatter';

it('groups scatter legend counts in the active language', () => {
  const series = [{id: 's', label: 'Series', color: 'currentColor', points: Array<ScatterPoint>(1234)}];
  for (const lang of ['en', 'zh-TW', 'zh-CN'] as const) {
    const html = renderToStaticMarkup(
      <LangContext.Provider value={lang}>
        <ScatterLegend series={series} />
      </LangContext.Provider>
    );
    expect(html).toContain('<b>1,234</b>');
  }
});
