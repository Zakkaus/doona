import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {MoreActionsList} from './ActionGroup';

const noop = () => {};

it('lists the actions in order with the destructive one marked', () => {
  const markup = renderToStaticMarkup(
    <MoreActionsList
      label="More actions"
      actions={[
        {id: 'trace', label: 'Trace', onAction: noop},
        {id: 'close', label: 'Close', negative: true, onAction: noop}
      ]}
    />
  );
  expect(markup).toContain('aria-label="More actions"');
  expect(markup.indexOf('Trace')).toBeLessThan(markup.indexOf('Close'));
  expect(markup).toMatch(/class="rp-item plain negative"[^>]*>.*Close/);
  expect(markup).not.toContain('aria-disabled');
});

it('describes a disabled item with its reason, and an enabled one with none', () => {
  const markup = renderToStaticMarkup(
    <MoreActionsList
      label="More actions"
      actions={[
        {id: 'edit', label: 'Edit', isDisabled: true, reason: 'The file is read-only', onAction: noop},
        {id: 'probe', label: 'Probe', reason: 'unused while enabled', onAction: noop}
      ]}
    />
  );
  // The item names every slot it may describe itself with; the reason's is among them.
  const reason = markup.match(/id="([^"]+)" slot="description">The file is read-only</);
  expect(reason).not.toBeNull();
  expect(markup).toMatch(new RegExp(`data-key="edit"`));
  expect(markup).toMatch(new RegExp(`aria-describedby="[^"]*\\b${reason![1]}\\b[^"]*"[^>]*data-key="edit"`));
  expect(markup).toContain('aria-disabled="true"');
  expect(markup).not.toContain('unused while enabled');
});
