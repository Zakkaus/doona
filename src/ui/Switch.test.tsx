import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {Switch} from './Fields';

it('associates its help without replacing an external description or label', () => {
  const markup = renderToStaticMarkup(
    <Switch isSelected={false} onChange={() => {}} description="Keeps cached answers." aria-describedby="external">
      Cache
    </Switch>
  );
  const input = markup.match(/<input[^>]*role="switch"[^>]*>/)![0];
  const descriptions = input.match(/aria-describedby="([^"]+)"/)![1].split(' ');
  expect(descriptions).toContain('external');
  expect(descriptions.some(id => markup.includes(`id="${id}" class="rp-label">Keeps cached answers.</span>`))).toBe(true);
  expect(markup).toContain('Cache');
});
