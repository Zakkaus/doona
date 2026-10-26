import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {Meter} from './Meter';

it('reads a meter as its value text, filled to its share', () => {
  const markup = renderToStaticMarkup(<Meter label="Usage" value={42} valueLabel="420 GB / 1 TB" tone="warn" />);
  expect(markup).toMatch(/role="meter\b/);
  expect(markup).toContain('aria-valuenow="42"');
  expect(markup).toContain('aria-valuetext="420 GB / 1 TB"');
  expect(markup).toContain('rp-meter warn');
  expect(markup).toContain('width:42%');
  expect(markup).not.toContain('data-size');
});

it('marks a small meter for its own label and track sizes', () => {
  expect(renderToStaticMarkup(<Meter size="S" label="Usage" value={42} valueLabel="420 GB / 1 TB" />)).toContain('data-size="S"');
});
