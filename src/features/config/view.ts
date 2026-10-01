import type {Engine} from '../../api/engines';
import type {ConfigDiagnostic, ConfigSource} from '../../api/model';
import {enumLabel} from '../../i18n/enum';
import {localTime, formatBytes} from '../../i18n/format';
import {formatList, formatNumber, type Lang, type Translator} from '../../i18n';
import {diagnosticMessage, refusalMessage, type BackendMessage} from '../../i18n/backend';
import type {Key} from '../../i18n';
import {fileName, redacted} from '../../dae/sources';
import {blockFields, scanConfig, type TextBlock, type TextToken} from '../../dae/text';
import {href as routeHref} from '../../shell/route';
import {groupPolicyText} from '../shared/policyText';
import {policyKind} from '../../dae/vocab';
import type {EditorMark} from '../../ui/code/CodeEditor';
import type {Help, KvItem} from '../../ui/ui';
import {sourceKinds} from './nav';

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

export function sourceMarks(diagnostics: ConfigDiagnostic[], sourceId: string, t: Translator): EditorMark[] {
  return diagnostics
    .filter(d => d.source_id === sourceId && d.line !== null)
    .map(d => ({line: d.line!, column: d.column, level: d.level, message: diagnosticText(diagnosticMessage(d, t), t)}));
}

// A diagnostic's words in its editor mark, where the row's backend disclosure has no room. A translated code keeps the
// backend's own words, which name the entry the code cannot.
function diagnosticText({summary, detail}: BackendMessage, t: Translator): string {
  return detail ? t('config.backendDetail', {text: summary, message: detail}) : summary;
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

// The page that shows and edits what a section defines.
export const sectionPages: Record<string, string | null> = {
  global: routeHref('config', {tab: 'global'}),
  subscription: routeHref('nodes'),
  node: routeHref('nodes'),
  group: routeHref('policies'),
  dns: routeHref('rules', {tab: 'dns'}),
  routing: routeHref('rules', {tab: 'list'})
};

// Card ids count occurrences rather than offsets, so an edit elsewhere in the file keeps an open editor on its card.
// A section counts wherever the main file or an include defines it; a read-only file still shows its sections.
export function sectionSummaries(sources: ConfigSource[], engine: Engine, lang: Lang, t: Translator): ModuleSection[] {
  const eligible = sources.filter(source => source.kind === 'main' || source.kind === 'include');
  const parsed = eligible.map(source => ({source, ...scanConfig(source.content)}));
  const main = sources.find(source => source.kind === 'main') ?? null;
  const sections = sectionKinds.flatMap<ModuleSection>(kind => {
    const href = sectionPages[kind];
    const occurrences = parsed.flatMap(({source, blocks, tokens}) =>
      blocks
        .filter(block => block.name === kind)
        .map((block, index) => ({
          id: `${source.id}:${kind}:${index}`,
          kind,
          source,
          block,
          href: kind === 'global' ? routeHref('config', {tab: 'global', source: source.id, section: String(index)}) : href,
          range: sectionRange(source, block),
          summary: sectionSummary(kind, source.content, block, tokens, lang, t),
          note: null
        }))
    );
    if (occurrences.length) return occurrences;
    return [
      {
        id: kind,
        kind,
        source: main,
        block: null,
        href,
        range: main ? fileName(main) : '',
        // Only a writable main file is offered as the place to add the section.
        summary: main?.writable ? t('config.moduleAbsent', {file: fileName(main)}) : t('config.moduleAbsentReadOnly'),
        note: null
      }
    ];
  });
  const withheld: ModuleSection[] = parsed.flatMap(({source, blocks}) =>
    engine.redactedSections(blocks).map(({block, name}, index) => ({
      id: `${source.id}:${block.name}:${index}`,
      kind: name,
      source,
      block: null,
      href: null,
      range: sectionRange(source, block),
      summary: '',
      note: t('config.incomplete')
    }))
  );
  return [...sections, ...withheld];
}

export function sourceView(source: ConfigSource, locale: string, t: Translator): SourceView {
  const kind = enumLabel(sourceKinds, source.kind, t);
  return {
    id: source.id,
    label: redacted(source) ? `${kind} ${source.id.slice(0, 8)}` : source.path,
    kind,
    facts: t('config.sourceFacts', {n: source.line_count, size: formatBytes(String(source.bytes), locale)}),
    loaded: t('config.loadedAt', {time: localTime(source.loaded_at, locale)})
  };
}
type SourceView = {id: string; label: string; kind: string; facts: string; loaded: string};

export type ReadOnlyReason = 'generated' | 'subscription' | 'disabled' | 'secret' | 'refused' | 'redacted';
// The badge and the line under the text saying what the file is and what can be done with it. A help popover beside
// the badge is kept only for what the line has no room for: how to turn configuration writes on.
const readOnlyText: Record<ReadOnlyReason, {label: Key; note: Key; help?: Key}> = {
  generated: {label: 'config.kind.generated', note: 'config.generatedNote'},
  subscription: {label: 'config.kind.subscription', note: 'config.subscriptionNote'},
  disabled: {label: 'config.readOnly', note: 'config.readOnlyNote', help: 'config.readOnlyHelp'},
  secret: {label: 'config.secretSource', note: 'config.secretNote'},
  refused: {label: 'config.readOnly', note: 'config.refusedNote'},
  redacted: {label: 'config.redactedSource', note: 'config.redactedNote'}
};
// Prefer the backend reason; older backends fall back to source kind and credential detection.
export function readOnlyBadge(
  source: Pick<ConfigSource, 'kind' | 'writable' | 'content' | 'read_only_reason'>,
  configWritable: boolean,
  complete: boolean | undefined,
  engine: Pick<Engine, 'holdsCredentials'>,
  t: Translator
): {reason: ReadOnlyReason; label: string; note: string; help?: Help} | null {
  const reported = !source.writable && refusalMessage({reason: source.read_only_reason}, t);
  if (reported) {
    const secret = source.read_only_reason === 'listener_secret_source' || source.read_only_reason === 'listener_secret_in_content';
    return {reason: secret ? 'secret' : 'refused', label: t(secret ? 'config.secretSource' : 'config.readOnly'), note: reported};
  }
  const reason: ReadOnlyReason | null =
    source.kind === 'generated' || source.kind === 'subscription'
      ? source.kind
      : !configWritable
        ? 'disabled'
        : !source.writable
          ? engine.holdsCredentials(source)
            ? 'secret'
            : 'refused'
          : complete === false
            ? 'redacted'
            : null;
  if (!reason) return null;
  const text = readOnlyText[reason];
  const label = t(text.label);
  return {reason, label, note: t(text.note), ...(text.help && {help: {title: label, text: t(text.help)}})};
}
export type DiagnosticRow = {
  id: string;
  level: ConfigDiagnostic['level'];
  tone: 'err' | 'warn' | 'info';
  levelText: string;
  sourceId: string;
  line: number | null;
  where: string;
  message: string;
  code: string;
  // What the diagnostic says, without where: the same error moved by an edit above it keeps it.
  identity: string;
  // The row as listed: its line (with the file when it is another source) and its message.
  text: string;
  // The backend's own words, kept under every row that has them, even where the message repeats them.
  backend: string | null;
  // A line in the source on show moves its editor; another source opens there.
  action: 'jump' | 'open' | null;
  count: number;
};
const tones = {error: 'err', warning: 'warn', info: 'info'} as const;
const levels: Record<ConfigDiagnostic['level'], Key> = {error: 'config.level.error', warning: 'config.level.warning', info: 'config.level.info'};
// Identical diagnostics, such as one warning per duplicate entry at the same place, share one row with their count.
export function diagnosticRows(
  diagnostics: ConfigDiagnostic[],
  sources: ConfigSource[],
  locale: string,
  t: Translator,
  current: string | null = null
): DiagnosticRow[] {
  const paths = new Map(sources.map(source => [source.id, fileName(source)]));
  // The key is also the row id, so a selection follows its diagnostic when the polled list changes around it.
  const groups = new Map<string, {item: ConfigDiagnostic; count: number}>();
  for (const item of diagnostics) {
    const key = JSON.stringify([item.level, item.source_id, item.line, item.column, item.code, item.message, item.params]);
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, {item, count: 1});
  }
  return [...groups].map(([key, {item, count}]) => {
    const path = paths.get(item.source_id) ?? item.source_id;
    const text = diagnosticMessage(item, t).summary;
    const message = count > 1 ? t('config.repeated', {text, n: formatNumber(count, locale)}) : text;
    const own = item.source_id === current;
    const line = item.line === null ? null : formatNumber(item.line, locale);
    return {
      id: key,
      level: item.level,
      tone: tones[item.level],
      levelText: enumLabel(levels, item.level, t),
      sourceId: item.source_id,
      line: item.line,
      where: item.line === null ? path : `${path}:${item.line}`,
      message,
      code: item.code,
      identity: JSON.stringify([item.source_id, item.code, item.message, item.params]),
      text:
        line === null
          ? own
            ? message
            : t('ui.valuePair', {label: path, value: message})
          : own
            ? t('config.atLine', {line, message})
            : t('config.atFile', {file: path, line, message}),
      backend: item.message || null,
      action: !own ? 'open' : item.line === null ? null : 'jump',
      count
    };
  });
}

// The diagnostics bar's counts, and its errors by what they say, so editing above one does not make it new.
export function diagnosticSummary(rows: DiagnosticRow[]) {
  const total = (level: ConfigDiagnostic['level']) => rows.filter(row => row.level === level).reduce((sum, row) => sum + row.count, 0);
  const errorKeys = [...new Set(rows.filter(row => row.level === 'error').map(row => row.identity))];
  return {errors: total('error'), warnings: total('warning'), errorKeys};
}

// The person's last open or collapse of the diagnostics bar, with the errors it listed then.
export type DiagnosticsChoice = {open: boolean; errorKeys: string[]};
// Errors open the list and anything less leaves it shut. A collapse holds until an error appears that it did not list;
// an open holds until the person collapses it.
export function diagnosticsOpen(errorKeys: string[], choice: DiagnosticsChoice | null): boolean {
  if (choice && (choice.open || errorKeys.every(key => choice.errorKeys.includes(key)))) return choice.open;
  return errorKeys.length > 0;
}

// The save button, shown only with unsaved changes. A refetch can make the source read-only while a draft is open;
// then Save is refused and its tip gives the reason. While a validation runs the disabled button says so; otherwise,
// saving included, it names the shortcut.
export function saveView(
  busy: 'save' | 'validate' | null,
  writable: boolean,
  readOnlyNote: string | null,
  mac: boolean,
  t: Translator
): {disabled: boolean; tip: string} {
  if (!writable && readOnlyNote) return {disabled: true, tip: readOnlyNote};
  const tip = t(busy === 'validate' ? 'config.saveValidating' : mac ? 'config.saveShortcutMac' : 'config.saveShortcut');
  return {disabled: !!busy || !writable, tip};
}

// Why Apply and reload is disabled, shown under it; null while it can run, while another change is being applied (the
// pending button shows that) or while the text is still being checked. A change on disk has its own banner above, so
// the line names what to do about it.
export function saveReason(
  {busy, complete = true, conflict, invalid = null}: {busy: boolean; complete?: boolean | null; conflict: boolean; invalid?: string | null},
  t: Translator
): string | null {
  if (busy || complete === null) return null;
  if (!complete) return t('config.incomplete');
  if (conflict) return t('config.saveConflict');
  return invalid;
}

// Why Validate is disabled: `candidates` is null when the sources cannot make a request. Null while their text is still
// being checked; otherwise the main file is not whole, or the file on show is not one validation covers.
export function validateReason(
  candidates: unknown[] | null,
  sources: ConfigSource[],
  isComplete: (source: ConfigSource) => boolean | undefined,
  t: Translator
): string | null {
  if (candidates) return null;
  const authored = sources.filter(source => source.kind === 'main' || source.kind === 'include');
  if (authored.some(source => isComplete(source) === undefined)) return null;
  const main = authored.find(source => source.kind === 'main');
  return t(main && isComplete(main) ? 'config.validateOther' : 'config.validateNoMain');
}

// The version of the active configuration. The generation id is a technical field and is not shown here.
export function configMetadata(revision: string, t: Translator): KvItem[] {
  return [{label: t('config.revision'), value: revision, help: {title: t('config.revision'), text: t('config.revisionHelp')}}];
}
