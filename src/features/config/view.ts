import type {Capabilities, ConfigDiagnostic, ConfigSource} from '../../api/model';
import {localTime, formatBytes} from '../../i18n/format';
import {formatList, formatNumber, type Lang, type Translator} from '../../i18n';
import {backendMessage} from '../../i18n/backend';
import type {Key} from '../../i18n';
import {fileName, redacted} from '../../dae/sources';
import {defaultGroup, isSubscriptionUrl, readState, type WizardState} from '../../dae/setup';
import {defaultTemplate, templates} from '../../dae/templates';
import {blockFields, isBareName, isQuotable, scanConfig, type TextBlock, type TextToken} from '../../dae/text';
import {href as routeHref} from '../../shell/route';
import {groupPolicyText} from '../policies/policyText';
import {policyKind} from '../../dae/vocab';
import type {EditorMark} from '../../ui/code/CodeEditor';

// Quick setup needs a writable main source with its text; a redacted text is shown but cannot be written back.
export function setupAvailable(resources: Capabilities['resources'] | undefined, main: ConfigSource | null | undefined): boolean {
  return !!main && resources?.config.writable === true && main.writable && main.content !== undefined;
}
export function configTabs(setup: boolean): Array<{id: 'modules' | 'setup' | 'source' | 'validate'; titleKey: Key}> {
  return [
    {id: 'modules', titleKey: 'config.tabModules'},
    ...(setup ? [{id: 'setup' as const, titleKey: 'config.wizard' as const}] : []),
    {id: 'source', titleKey: 'config.tabSource'},
    {id: 'validate', titleKey: 'config.tabValidate'}
  ];
}

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
      token.parens === 0 &&
      token.kind === 'text' &&
      text.slice(token.from, token.to) === '->'
  ).length;
}

// Subscription and node entries may be a bare link without a tag; each such value is an entry of its own.
function entryCount(block: TextBlock, tokens: TextToken[], fields: ReturnType<typeof blockFields>): number {
  const untagged = tokens.filter(
    token =>
      token.from > block.open &&
      token.to <= block.close &&
      token.depth === block.depth + 1 &&
      token.parens === 0 &&
      (token.kind === 'quoted' || token.kind === 'text') &&
      !fields.some(field => token.from >= field.from && token.to <= field.to)
  );
  return fields.length + untagged.length;
}

function sectionSummary(kind: SectionKind, text: string, block: TextBlock, tokens: TextToken[], lang: Lang, t: Translator): string {
  const fields = blockFields(text, block, tokens);
  switch (kind) {
    case 'global':
      return t('config.moduleSettings', {n: fields.length});
    case 'subscription':
      return t('config.moduleSubscriptions', {n: entryCount(block, tokens, fields)});
    case 'node':
      return t('config.moduleNodes', {n: entryCount(block, tokens, fields)});
    case 'group':
      return t('config.moduleGroups', {
        n: block.children.length,
        policies: formatList(
          lang,
          block.children.map(child => {
            const policy = blockFields(text, child, tokens).find(field => field.name === 'policy')?.value;
            if (!policy) return child.name;
            const kind = policyKind(policy);
            return t('ui.valuePair', {label: child.name, value: kind ? groupPolicyText({kind, native: policy}, t).label : policy});
          })
        )
      });
    case 'dns': {
      const upstreams = block.children.filter(child => child.name === 'upstream');
      const routing = block.children.filter(child => child.name === 'routing').flatMap(child => child.children);
      // Three counts, each with its own plural form.
      return [
        t('config.moduleDnsUpstreams', {n: upstreams.reduce((n, child) => n + blockFields(text, child, tokens).length, 0)}),
        t('config.moduleDnsRequests', {n: routing.filter(child => child.name === 'request').reduce((n, child) => n + ruleCount(text, child, tokens), 0)}),
        t('config.moduleDnsResponses', {n: routing.filter(child => child.name === 'response').reduce((n, child) => n + ruleCount(text, child, tokens), 0)})
      ].join(t('ui.listSeparator'));
    }
    case 'routing': {
      const rules = t('config.moduleRules', {n: ruleCount(text, block, tokens)});
      const fallback = fields.find(field => field.name === 'fallback')?.value;
      return fallback ? rules + t('ui.separator') + t('ui.valuePair', {label: 'fallback', value: fallback}) : rules;
    }
  }
}

// Card ids count occurrences rather than offsets, so an edit elsewhere in the file keeps an open editor on its card.
export function sectionSummaries(sources: ConfigSource[], lang: Lang, t: Translator): ModuleSection[] {
  const eligible = sources.filter(source => source.kind === 'main' || (source.kind === 'include' && source.writable));
  const parsed = eligible.map(source => ({source, ...scanConfig(source.content ?? '')}));
  const main = sources.find(source => source.kind === 'main') ?? null;
  const sections = sectionKinds.flatMap<ModuleSection>(kind => {
    const href = kind === 'group' ? routeHref('policies') : kind === 'node' || kind === 'subscription' ? routeHref('nodes') : null;
    const occurrences = parsed.flatMap(({source, blocks, tokens}) =>
      blocks
        .filter(block => block.name === kind)
        .map((block, index) => ({
          id: `${source.id}:${kind}:${index}`,
          kind,
          source,
          block,
          href,
          range: sectionRange(source, block),
          summary: sectionSummary(kind, source.content!, block, tokens, lang, t),
          note: null
        }))
    );
    // A main file whose text is withheld gets one card of its own below; absence cannot be told from it.
    if (occurrences.length || (main && main.content === undefined)) return occurrences;
    return [
      {
        id: kind,
        kind,
        source: main,
        block: null,
        href,
        range: main ? fileName(main) : 'config.dae',
        summary: main?.content === undefined ? '' : t('config.moduleAbsent', {file: fileName(main)}),
        note: main?.content === undefined ? t('config.contentWithheld') : null
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
          note: t('config.contentWithheld')
        }
      ];
    return blocks
      .filter(block => block.name === 'experimental' && block.children.some(child => child.name === 'native_api'))
      .map((block, index) => ({
        id: `${source.id}:experimental:${index}`,
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

export const sourceKinds: Record<ConfigSource['kind'], Key> = {
  main: 'config.kind.main',
  include: 'config.kind.include',
  subscription: 'config.kind.subscription',
  generated: 'config.kind.generated'
};
export function sourceView(source: ConfigSource, locale: string, t: Translator): SourceView {
  const kind = t(sourceKinds[source.kind]);
  return {
    id: source.id,
    label: redacted(source) ? `${kind} ${source.id.slice(0, 8)}` : source.path,
    kind,
    editable: t(source.writable ? 'config.editable' : 'config.readOnly'),
    tone: source.writable ? ('ok' as const) : ('muted' as const),
    facts: t('config.sourceFacts', {
      lines: formatNumber(source.line_count, locale),
      size: formatBytes(String(source.bytes), locale),
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
  detail: string;
};
type WizardRow = {index: number; name: string; url: string; raw: string | null; nameError?: string; error?: string; description?: string; removeLabel: string};
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
      message: backendMessage(item.code, item.message, t),
      code: item.code,
      detail:
        item.line === null
          ? backendMessage(item.code, item.message, t)
          : t('config.atFile', {file: path, line: formatNumber(item.line, locale), message: backendMessage(item.code, item.message, t)})
    };
  });
}
export function wizardInitial(content: string): WizardState {
  const read = readState(content);
  return {...read, rules: content.trim() ? 'keep' : defaultTemplate};
}
// A value the file cannot hold is flagged on its own field, not on every row.
const writableName = (name: string) => isBareName(name.trim()) || isQuotable(name.trim());
export function wizardRows(state: WizardState, lang: Lang, t: Translator): {groupUsedText: string | null; rows: WizardRow[]} {
  return {
    groupUsedText:
      state.rules === 'keep'
        ? null
        : templates[state.rules].groups.length
          ? t('config.wizardNamedGroups', {
              names: formatList(
                lang,
                templates[state.rules].groups.map(group => group.name)
              )
            })
          : t('config.wizardGroupUsed', {name: state.group ?? defaultGroup}),
    rows: state.subscriptions.flatMap((item, index) =>
      item.raw !== undefined && !item.raw.trim()
        ? []
        : [
            {
              index,
              name: item.name,
              url: item.url,
              raw: item.raw !== undefined && !item.name ? item.raw.trim() : null,
              nameError: item.raw === undefined && !writableName(item.name) ? t('config.unquotable') : undefined,
              error:
                item.url !== '' && !isSubscriptionUrl(item.url)
                  ? t('config.wizardSubscriptionHelp')
                  : item.raw === undefined && !isQuotable(item.url.trim())
                    ? t('config.unquotable')
                    : undefined,
              description: index === 0 ? t('config.wizardSubscriptionHelp') : undefined,
              removeLabel: t('config.wizardRemove', {name: item.name || item.raw?.trim() || ''})
            }
          ]
    )
  };
}
