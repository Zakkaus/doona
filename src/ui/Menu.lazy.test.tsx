import {expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ChoiceMenu} from './Menu';

it('does not build row sections or mount their search while the menu is closed', () => {
  const sections = vi.fn(() => [{title: 'Groups', value: '', items: Array.from({length: 20}, (_, id) => ({id: String(id), label: `Group ${id}`}))}]);
  const markup = renderToStaticMarkup(
    <ChoiceMenu label="Node actions" sections={sections} searchLabel="Filter groups">
      Actions
    </ChoiceMenu>
  );
  expect(sections).not.toHaveBeenCalled();
  expect(markup).not.toContain('Group 19');
  expect(markup).not.toContain('searchbox');
});
