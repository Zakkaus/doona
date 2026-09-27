import {expect, it} from 'vitest';
import {guideSections, guideSubsections} from '../shared/guide';
import {guideContent} from './content';

it('renders every anchor in every language: sections in order, each subsection once', async () => {
  for (const [lang, load] of Object.entries(guideContent)) {
    const content = await load();
    expect(
      content.sections.map(section => section.id),
      lang
    ).toEqual([...guideSections]);
    const subsections = content.sections.flatMap(section => section.blocks.flatMap(block => (block.kind === 'h' && block.id ? [block.id] : [])));
    expect([...subsections].sort(), lang).toEqual([...guideSubsections].sort());
  }
});
