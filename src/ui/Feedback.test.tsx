import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ChartWait, ProblemAlert} from './Feedback';

it.each([
  [undefined, 'negative', 'alert'],
  ['negative', 'negative', 'alert'],
  ['neutral', 'informative', 'status']
] as const)('shows a %s problem with the %s tone', (kind, tone, role) => {
  const markup = renderToStaticMarkup(<ProblemAlert problem={{id: 1, text: 'Saved, not confirmed.', kind}} />);
  expect(markup).toContain(`rp-alert ${tone}`);
  expect(markup).toContain(`role="${role}"`);
});

it.each([
  [undefined, 'rp-chart-wait'],
  ['tall', 'rp-chart-wait tall']
] as const)('holds a %s chart place with one block', (holds, className) => {
  expect(renderToStaticMarkup(<ChartWait holds={holds}>Loading</ChartWait>)).toBe(`<div class="${className}">Loading</div>`);
});
