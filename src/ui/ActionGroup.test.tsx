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

it('checks the settings among the actions in one section and keeps the labels in one column', () => {
  const markup = renderToStaticMarkup(
    <MoreActionsList
      label="Panel options"
      actions={[
        {id: 'dock', label: 'Dock', onAction: noop},
        {id: 'edge', label: 'Hide at edge', checked: true, onAction: noop},
        {id: 'hide', label: 'Hide', onAction: noop},
        {id: 'snap', label: 'Snap', checked: false, onAction: noop}
      ]}
    />
  );
  expect(markup).toMatch(/role="menuitemcheckbox"[^>]*aria-checked="true"[^>]*data-key="edge"|data-key="edge"[^>]*aria-checked="true"/);
  expect(markup).toMatch(/role="menuitem"[^>]*data-key="dock"|data-key="dock"[^>]*role="menuitem"/);
  expect(markup).not.toContain('rp-item plain');
  expect(markup.match(/rp-check-mark/g)).toHaveLength(4);
  expect(markup.match(/role="group"/g)).toHaveLength(1);
  // The section stands where its first setting does, holding both.
  expect([...markup.matchAll(/data-key="(\w+)"/g)].map(match => match[1])).toEqual(['dock', 'edge', 'snap', 'hide']);
  expect(markup).toMatch(/data-key="snap"[^>]*aria-checked="false"|aria-checked="false"[^>]*data-key="snap"/);
});
