import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ProblemAlert} from './Alert';

it.each([
  [undefined, 'negative', 'alert'],
  ['negative', 'negative', 'alert'],
  ['neutral', 'informative', 'status']
] as const)('shows a %s problem with the %s tone', (kind, tone, role) => {
  const markup = renderToStaticMarkup(<ProblemAlert problem={{id: 1, text: 'Saved, not confirmed.', kind}} />);
  expect(markup).toContain(`rp-alert ${tone}`);
  expect(markup).toContain(`role="${role}"`);
});

it('lists the refused lines under the text, then what the caller adds', () => {
  const markup = renderToStaticMarkup(
    <ProblemAlert problem={{id: 1, text: 'Validation found 2 errors; nothing written', lines: ['config.dae line 7: first', 'config.dae line 9: second']}}>
      <b>extra</b>
    </ProblemAlert>
  );
  expect(markup).toMatch(
    /nothing written<span class="rp-alert-detail">config\.dae line 7: first<\/span><span class="rp-alert-detail">config\.dae line 9: second<\/span><b>extra<\/b>/
  );
});
