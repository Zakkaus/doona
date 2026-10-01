import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {DaeCode} from './DaeCode';

it('offers wrapping without losing or abbreviating long tokens', () => {
  const domain = 'a'.repeat(63) + '.' + 'b'.repeat(63) + '.example';
  const markup = renderToStaticMarkup(<DaeCode text={`domain(full: ${domain}) -> direct`} wrap />);
  expect(markup).toContain('data-wrap="true"');
  expect(markup).toContain(domain);
  expect(renderToStaticMarkup(<DaeCode text={domain} />)).not.toContain('data-wrap');
});
