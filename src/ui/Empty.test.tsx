import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ChartWait} from './Empty';

it.each([
  [undefined, 'rp-chart-wait'],
  ['tall', 'rp-chart-wait tall']
] as const)('holds a %s chart place with one block', (holds, className) => {
  expect(renderToStaticMarkup(<ChartWait holds={holds}>Loading</ChartWait>)).toBe(`<div class="${className}">Loading</div>`);
});
