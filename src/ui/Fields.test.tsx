import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {StaticField} from './Fields';
import {LabeledSelect} from './Select';

it('shows a single choice as text with its help below, not as a picker', () => {
  const item = {id: 'end', label: 'New response block, as its first rule', desc: 'The dns section has no response block yet.'};
  const markup = renderToStaticMarkup(<StaticField label="Insert position" value={item.label} description={item.desc} />);
  expect(markup).toMatch(/role="group" aria-labelledby="([^"]+)-label" aria-describedby="\1-help"/);
  expect(markup).toContain('>Insert position</span><span>New response block, as its first rule</span>');
  expect(markup).toContain('class="rp-label"');
  expect(markup).toContain('The dns section has no response block yet.');
  expect(markup).not.toMatch(/<button|aria-haspopup|role="(combobox|listbox)"/);
  // The same choice in a picker renders the button this field replaces.
  expect(renderToStaticMarkup(<LabeledSelect label="Insert position" items={[item]} value="end" onChange={() => {}} />)).toContain('<button');
});

it('names the field without a description when the choice has no help', () => {
  expect(renderToStaticMarkup(<StaticField label="Insert position" value="End of list" />)).not.toContain('aria-describedby');
});
