import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {compactSamples, WidgetAreaChart} from './compact';
it('keeps the current reading without a near-vertical terminal segment', () => {
  expect(compactSamples([0, 5000, 10000, 10001])).toEqual([0, 1, 3]);
  expect(compactSamples([0, 5000, 10000])).toEqual([0, 1, 2]);
});

// Every size lists the series with their latest value, so a still chart still says what each colour is.
it.each(['normal', 'compact', 'widget'] as const)('shows the legend at the %s size', size => {
  const markup = renderToStaticMarkup(
    <WidgetAreaChart
      size={size}
      label="Last minute"
      locale="en"
      fmt={value => `${value} B/s`}
      timestamps={[0, 5000]}
      series={[{label: 'Download', color: '#286983', values: [1, 2]}]}
    />
  );
  expect(markup).toContain('rp-legend');
  expect(markup).toContain('Download');
});
