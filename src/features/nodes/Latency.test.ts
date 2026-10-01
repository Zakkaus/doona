import {expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import type {ReactNode} from 'react';

vi.mock('../../ui/ui', () => ({Link: ({children}: {children: ReactNode}) => children}));
vi.mock('../../ui/NodeName', () => ({NodeName: ({name}: {name: string}) => name}));
const text = (value: ReactNode) => renderToStaticMarkup(value);
import {translate, type Translator} from '../../i18n';
import {missingNames} from './Latency';

const rows = Array.from({length: 8}, (_, i) => ({id: String(i), name: `node-${i}`, state: 'unavailable' as const}));

it('shortens a long list of names in one message the language can reorder', () => {
  const en: Translator = (key, params) => translate('en', key, params);
  expect(text(missingNames(rows.slice(0, 2), 'en', en, new Map()))).toBe('node-0, node-1');
  expect(text(missingNames(rows, 'en', en, new Map()))).toBe('node-0, node-1, node-2, node-3, node-4, node-5 and 2 more');
  const countFirst: Translator = (key, params) => (key === 'nodes.latency.andMore' ? `${params?.more}: ${params?.names}` : en(key, params));
  expect(text(missingNames(rows, 'en', countFirst, new Map()))).toBe('2 more: node-0, node-1, node-2, node-3, node-4, node-5');
});
