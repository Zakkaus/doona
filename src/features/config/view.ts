import type {ConfigDiagnostic, ConfigSource} from '../../api/model';
import {formatBytes} from '../../api/u64';
import {localTime} from '../../api/selectors';
import {formatNumber, type Translator} from '../../i18n';
import type {Key} from '../../i18n/messages';
import {fileName, redacted} from './names';
import {defaultGroup, defaultTemplate, isSubscriptionUrl, readState, type WizardState} from './wizard';
import {blockFields, scanConfig, type TextBlock, type TextToken} from '../../dae/text';
import {buildHash} from '../../shell/route';
import type {EditorMark} from '../../ui/code/CodeEditor';

const sectionKinds = ['global', 'subscription', 'node', 'group', 'dns', 'routing'] as const;
type SectionKind = (typeof sectionKinds)[number];
export type ModuleSection = {
  id: string;
  kind: string;
  source: ConfigSource | null;
  block: TextBlock | null;
  range: string;
  summary: string;
  note: string | null;
  href: string | null;
};

export function sectionRange(source: ConfigSource, block: TextBlock): string {
  return `${fileName(source)}:${block.line + 1}-${block.endLine + 1}`;
}

export function splice(text: string, block: Pick<TextBlock, 'from' | 'to'>, replacement: string): string {
  return text.slice(0, block.from) + replacement + text.slice(block.to);
}

export function sectionMarks(diagnostics: ConfigDiagnostic[], sourceId: string, block: TextBlock, text: string): EditorMark[] {
  const end = block.line + text.split('\n').length;
  return diagnostics
    .filter(d => d.source_id === sourceId && d.line !== null && d.line > block.line && d.line <= end)
    .map(d => ({line: d.line! - block.line, column: d.column, level: d.level, message: d.message}));
}

export function sourceMarks(diagnostics: ConfigDiagnostic[], sourceId: string): EditorMark[] {
  return diagnostics.filter(d => d.source_id === sourceId && d.line !== null).map(d => ({line: d.line!, column: d.column, level: d.level, message: d.message}));
}

function ruleCount(text: string, block: TextBlock, tokens: TextToken[]): number {
  return tokens.filter(
    token =>
      token.from > block.open &&
      token.to <= block.close &&
      token.depth === block.depth + 1 &&
      token.kind === 'text' &&
      text.slice(token.from, token.to) === '->'
  ).length;
}

function sectionSummary(kind: SectionKind, text: string, block: TextBlock, tokens: TextToken[], t: Translator): string {
  const fields = blockFields(text, block, tokens);
  switch (kind) {
    case 'global':
      return t('config.moduleSettings', {n: fields.length});
    case 'subscription':
      return t('config.moduleSubscriptions', {n: fields.length});
    case 'node':
      return t('config.moduleNodes', {n: fields.length});
    case 'group':
      return t('config.moduleGroups', {
        n: block.children.length,
        policies: block.children
          .map(child => {
            const policy = blockFields(text, child, tokens).find(field => field.name === 'policy')?.value;
            return policy ? `${child.name}: ${policy}` : child.name;
          })
          .join(', ')
      });
    case 'dns': {
      const upstreams = block.children.filter(child => child.name === 'upstream');
      const routing = block.children.filter(child => child.name === 'routing').flatMap(child => child.children);
      return t('config.moduleDns', {
        upstreams: upstreams.reduce((n, child) => n + blockFields(text, child, tokens).length, 0),
        requests: routing.filter(child => child.name === 'request').reduce((n, child) => n + ruleCount(text, child, tokens), 0),
        responses: routing.filter(child => child.name === 'response').reduce((n, child) => n + ruleCount(text, child, tokens), 0)
      });
    }
    case 'routing': {
      const rules = t('config.moduleRules', {n: ruleCount(text, block, tokens)});
      const fallback = fields.find(field => field.name === 'fallback')?.value;
      return fallback ? `${rules} · fallback: ${fallback}` : rules;
    }
  }
}

export function sectionSummaries(sources: ConfigSource[], t: Translator): ModuleSection[] {
  const eligible = sources.filter(source => source.kind === 'main' || (source.kind === 'include' && source.writable));
  const parsed = eligible.map(source => ({source, ...scanConfig(source.content ?? '')}));
  const main = sources.find(source => source.kind === 'main') ?? null;
  const sections = sectionKinds.flatMap<ModuleSection>(kind => {
    const href = kind === 'group' ? buildHash('policies') : kind === 'node' || kind === 'subscription' ? buildHash('nodes') : null;
    const occurrences = parsed.flatMap(({source, blocks, tokens}) =>
      blocks
        .filter(block => block.name === kind)
        .map(block => ({
          id: `${source.id}:${block.from}`,
          kind,
          source,
          block,
          href,
          range: sectionRange(source, block),
          summary: sectionSummary(kind, source.content!, block, tokens, t),
          note: null
        }))
    );
    return occurrences.length
      ? occurrences
      : [
          {
            id: kind,
            kind,
            source: main,
            block: null,
            href,
            range: main ? fileName(main) : 'config.dae',
            summary: main?.content === undefined ? '' : t('config.moduleAbsent', {file: fileName(main)}),
            note: main?.content === undefined ? t('config.contentCredential') : null
          }
        ];
  });
  const withheld: ModuleSection[] = parsed.flatMap(({source, blocks}) => {
    if (source.content === undefined)
      return [
        {
          id: source.id,
          kind: fileName(source),
          source,
          block: null,
          href: null,
          range: fileName(source),
          summary: '',
          note: t('config.contentCredential')
        }
      ];
    return blocks
      .filter(block => block.name === 'experimental' && block.children.some(child => child.name === 'native_api'))
      .map(block => ({
        id: `${source.id}:${block.from}`,
        kind: 'experimental.native_api',
        source,
        block: null,
        href: null,
        range: sectionRange(source, block),
        summary: '',
        note: t('config.incomplete')
      }));
  });
  return [...sections, ...withheld];
}

const kinds: Record<ConfigSource['kind'], Key> = {
  main: 'config.kind.main',
  include: 'config.kind.include',
  subscription: 'config.kind.subscription',
  generated: 'config.kind.generated'
};
export function sourceView(source: ConfigSource, locale: string, t: Translator): SourceView {
  const kind = t(kinds[source.kind]);
  return {
    id: source.id,
    label: redacted(source) ? `${kind} · ${source.id.slice(0, 8)}` : source.path,
    kind,
    editable: t(source.writable ? 'config.editable' : 'config.readOnly'),
    tone: source.writable ? ('ok' as const) : ('muted' as const),
    facts: t('config.sourceFacts', {
      lines: formatNumber(source.line_count, locale),
      size: formatBytes(String(source.bytes)),
      time: localTime(source.loaded_at, locale)
    }),
    hasContent: source.content !== undefined
  };
}
type SourceView = {id: string; label: string; kind: string; editable: string; tone: 'ok' | 'muted'; facts: string; hasContent: boolean};
type DiagnosticRow = {
  id: string;
  level: ConfigDiagnostic['level'];
  tone: 'err' | 'warn' | 'info';
  levelText: string;
  sourceId: string;
  line: number | null;
  where: string;
  message: string;
  code: string;
  inline: string;
  detail: string;
};
type WizardRow = {index: number; name: string; url: string; raw: string | null; error?: string; description?: string; removeLabel: string};
const tones = {error: 'err', warning: 'warn', info: 'info'} as const;
const levels: Record<ConfigDiagnostic['level'], Key> = {error: 'config.level.error', warning: 'config.level.warning', info: 'config.level.info'};
export function diagnosticRows(diagnostics: ConfigDiagnostic[], sources: ConfigSource[], locale: string, t: Translator): DiagnosticRow[] {
  const paths = new Map(sources.map(source => [source.id, fileName(source)]));
  return diagnostics.map((item, index) => {
    const path = paths.get(item.source_id) ?? item.source_id;
    return {
      id: String(index),
      level: item.level,
      tone: tones[item.level],
      levelText: t(levels[item.level]),
      sourceId: item.source_id,
      line: item.line,
      where: item.line === null ? path : `${path}:${item.line}`,
      message: item.message,
      code: item.code,
      inline: item.line === null ? item.message : t('config.atLine', {line: formatNumber(item.line, locale), message: item.message}),
      detail: item.line === null ? item.message : t('config.atFile', {file: path, line: formatNumber(item.line, locale), message: item.message})
    };
  });
}
export function wizardInitial(content: string): WizardState {
  const read = readState(content);
  return {...read, rules: content.trim() ? 'keep' : defaultTemplate};
}
export function wizardRows(state: WizardState, error: string | undefined, t: Translator): {groupUsedText: string; rows: WizardRow[]} {
  return {
    groupUsedText: t('config.wizardGroupUsed', {name: state.group ?? defaultGroup}),
    rows: state.subscriptions.flatMap((item, index) =>
      item.raw !== undefined && !item.raw.trim()
        ? []
        : [
            {
              index,
              name: item.name,
              url: item.url,
              raw: item.raw !== undefined && !item.name ? item.raw.trim() : null,
              error: item.url !== '' && !isSubscriptionUrl(item.url) ? t('config.wizardSubscriptionHelp') : error,
              description: index === 0 ? t('config.wizardSubscriptionHelp') : undefined,
              removeLabel: t('config.wizardRemove', {name: item.name || item.raw?.trim() || ''})
            }
          ]
    )
  };
}
