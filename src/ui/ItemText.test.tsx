import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ListBox, ListBoxItem} from 'react-aria-components';
import {ItemText} from './Select';

// The option is named by its label alone; the description is announced as the description, not twice.
it('names an option with a description by its label slot', () => {
  const markup = renderToStaticMarkup(
    <ListBox aria-label="Choices">
      <ListBoxItem id="a" textValue="Alpha">
        <ItemText i={{id: 'a', label: 'Alpha', desc: 'First letter'}} />
      </ListBoxItem>
    </ListBox>
  );
  const option = markup.match(/<div[^>]*role="option"[^>]*>/)![0];
  const labelled = option.match(/aria-labelledby="([^"]+)"/)![1];
  const described = option.match(/aria-describedby="([^"]+)"/)![1];
  expect(markup).toMatch(new RegExp(`id="${labelled}"[^>]*><span class="rp-il">.*Alpha.*</span></span>`));
  expect(markup).toContain(`id="${described}"`);
  expect(labelled).not.toBe(described);
});
