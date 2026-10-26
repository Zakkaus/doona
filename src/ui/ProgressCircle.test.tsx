import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ProgressCircle} from './ProgressCircle';

it.each([
  ['S', '0 0 16 16', '7'],
  ['M', '0 0 32 32', '14.5']
] as const)('draws an indeterminate %s progress circle with its own stroke', (size, box, r) => {
  const markup = renderToStaticMarkup(<ProgressCircle size={size} aria-label="Loading" />);
  expect(markup).toContain('role="progressbar"');
  expect(markup).not.toContain('aria-valuenow');
  expect(markup).toContain(`data-size="${size}"`);
  expect(markup).toContain(`viewBox="${box}"`);
  expect(markup).toContain(`r="${r}"`);
});
