import '../../ui/styles/guide.css';
import {use, useEffect, type ReactNode} from 'react';
import {useLang, useT, type Lang} from '../../i18n';
import {Card, InlineAlert, Link} from '../../ui/ui';
import {DaeCode} from '../../ui/DaeCode';
import type {PageProps} from '../../shell/routes';
import {guideHref, guideSectionId, isGuideAnchor} from '../shared/guide';
import {guideContent} from './content';
import type {GuideBlock, GuideContent} from './types';

const loaded = new Map<Lang, Promise<GuideContent>>();
function load(lang: Lang) {
  let pending = loaded.get(lang);
  if (!pending) {
    // A failed chunk is asked for again on the next render rather than cached.
    pending = guideContent[lang]().catch((error: unknown) => {
      loaded.delete(lang);
      throw error;
    });
    loaded.set(lang, pending);
  }
  return pending;
}

// Backticks mark code; the rest is plain text.
function Text({text}: {text: string}) {
  return text.split(/`([^`]+)`/).map((part, index) =>
    index % 2 ? (
      <code key={index} className="rp-code">
        {part}
      </code>
    ) : (
      part
    )
  );
}

function Block({block}: {block: GuideBlock}): ReactNode {
  switch (block.kind) {
    case 'p':
      return (
        <p className="rp-guide-p">
          <Text text={block.text} />
        </p>
      );
    case 'h':
      return (
        <h3 className="rp-guide-h" id={block.id && guideSectionId(block.id)}>
          {block.text}
        </h3>
      );
    case 'list': {
      const List = block.ordered ? 'ol' : 'ul';
      return (
        <List className="rp-guide-list">
          {block.items.map(item => (
            <li key={item}>
              <Text text={item} />
            </li>
          ))}
        </List>
      );
    }
    case 'code':
      return block.lang === 'dae' ? (
        <DaeCode as="pre" className="rp-guide-code" text={block.text} />
      ) : (
        <pre className="rp-code rp-guide-code">{block.text}</pre>
      );
    case 'table':
      return (
        <div className="rp-guide-scroll">
          <table className="rp-guide-table">
            <thead>
              <tr>
                {block.head.map(cell => (
                  <th key={cell} scope="col">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map(row => (
                <tr key={row[0]}>
                  {row.map((cell, index) => (
                    <td key={index}>
                      <Text text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'links':
      return (
        <ul className="rp-guide-list">
          {block.items.map(item => (
            <li key={item.href}>
              <Link appearance="link" href={item.href} external={!item.href.startsWith('#')}>
                {item.text}
              </Link>
            </li>
          ))}
        </ul>
      );
  }
}

// The interim setup guide: honk and doona from nothing to every page working. The text is data per language, next to
// this page, so the guide ships in its own chunks.
export function Guide({query}: PageProps) {
  const t = useT();
  const content = use(load(useLang()));
  const section = new URLSearchParams(query).get('section');
  useEffect(() => {
    if (isGuideAnchor(section)) document.getElementById(guideSectionId(section))?.scrollIntoView({block: 'start'});
  }, [section, content]);
  return (
    <div className="rp-page rp-guide">
      <InlineAlert tone="informative" title={content.interimTitle}>
        <Text text={content.interim} />
      </InlineAlert>
      <nav className="rp-guide-toc" aria-label={t('guide.contents')}>
        <ol>
          {content.sections.map(item => (
            <li key={item.id}>
              <Link appearance="link" href={guideHref(item.id)}>
                {item.title}
              </Link>
            </li>
          ))}
        </ol>
      </nav>
      {content.sections.map(item => (
        <Card key={item.id} level={2} title={item.title} titleId={guideSectionId(item.id)} className="rp-guide-section">
          {item.blocks.map((block, index) => (
            <Block key={index} block={block} />
          ))}
        </Card>
      ))}
    </div>
  );
}
