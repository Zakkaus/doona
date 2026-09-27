import type {Engine} from '../../api/engines';
import type {ConfigDiagnostic, ConfigSource} from '../../api/model';
import {enumLabel} from '../../i18n/enum';
import {localTime, formatBytes} from '../../i18n/format';
import {formatList, formatNumber, type Lang, type Translator} from '../../i18n';
import {backendMessage, knownCode} from '../../i18n/backend';
import type {Key} from '../../i18n';
import {fileName, redacted} from '../../dae/sources';
import {defaultGroup, isSubscriptionUrl, readState, type WizardState} from '../../dae/setup';
import {defaultTemplate, templates} from '../../dae/templates';
import {blockFields, isQuotable, scanConfig, type TextBlock, type TextToken} from '../../dae/text';
import {isWritableName} from '../../dae/groups';
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

// Why a module's Edit is disabled: a draft open in another section, else another change still being applied.
export const moduleEditTip = (dirty: boolean, busy: boolean, t: Translator) =>
  dirty ? t('config.moduleEditBlocked') : busy ? t('ui.changeApplying') : undefined;

export function sectionRange(source: ConfigSource, block: TextBlock): string {
  return `${fileName(source)}:${block.line + 1}-${block.endLine + 1}`;
}

export function splice(text: string, block: Pick<TextBlock, 'from' | 'to'>, replacement: string): string {
  return text.slice(0, block.from) + replacement + text.slice(block.to);
}

// A section being edited, with the file and block it was read from.
export type SectionDraft = {section: ModuleSection & {source: ConfigSource; block: TextBlock}; text: string};

// A section draft against the sections as loaded now. A file changed only outside the section, or a draft not yet
// typed in, is carried over to the new text, since splicing the draft into it keeps that change. A section changed or
// removed on disk is a conflict the person settles, since saving would replace text they have not seen. `next` is the
// draft carried over to the section as it is now, when it is still there.
export function sectionUnder(draft: SectionDraft, sections: ModuleSection[]): {next: SectionDraft | null; conflict: boolean} {
  const {section, text} = draft;
  const current = sections.find(item => item.id === section.id);
  if (current?.source?.content_sha256 === section.source.content_sha256) return {next: null, conflict: false};
  if (!current?.source?.content || !current.block) return {next: null, conflict: true};
  const now = current.source.content.slice(current.block.from, current.block.to);
  const base = section.source.content!.slice(section.block.from, section.block.to);
  const next = {section: {...current, source: current.source, block: current.block}, text: text === base ? now : text};
  return {next, conflict: now !== base && text !== base && now !== text};
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
// A section counts wherever the main file or an include defines it; a read-only file still shows its sections.
export function sectionSummaries(sources: ConfigSource[], lang: Lang, t: Translator): ModuleSection[] {
  const eligible = sources.filter(source => source.kind === 'main' || source.kind === 'include');
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
        // Only a writable main file is offered as the place to add the section.
        summary: main?.content === undefined ? '' : main.writable ? t('config.moduleAbsent', {file: fileName(main)}) : t('config.moduleAbsentReadOnly'),
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

export function sourceView(source: ConfigSource, locale: string, t: Translator): SourceView {
  const kind = enumLabel(sourceKinds, source.kind, t);
  return {
    id: source.id,
    label: redacted(source) ? `${kind} ${source.id.slice(0, 8)}` : source.path,
    kind,
    facts: t('config.sourceFacts', {n: source.line_count, size: formatBytes(String(source.bytes), locale)}),
    loaded: t('config.loadedAt', {time: localTime(source.loaded_at, locale)}),
    hasContent: source.content !== undefined
  };
}
type SourceView = {id: string; label: string; kind: string; facts: string; loaded: string; hasContent: boolean};

export type ReadOnlyReason = 'generated' | 'subscription' | 'disabled' | 'secret' | 'refused' | 'withheld' | 'redacted';
// The badge and the line under the text saying what the file is and what can be done with it. A help popover beside
// the badge is kept only for what the line has no room for: how to turn configuration writes on.
const readOnlyText: Record<ReadOnlyReason, {label: Key; note: Key; help?: Key}> = {
  generated: {label: 'config.kind.generated', note: 'config.generatedNote'},
  subscription: {label: 'config.kind.subscription', note: 'config.subscriptionNote'},
  disabled: {label: 'config.readOnly', note: 'config.readOnlyNote', help: 'config.readOnlyHelp'},
  secret: {label: 'config.secretSource', note: 'config.secretNote'},
  refused: {label: 'config.readOnly', note: 'config.refusedNote'},
  withheld: {label: 'config.withheldSource', note: 'config.contentWithheld'},
  redacted: {label: 'config.redactedSource', note: 'config.redactedNote'}
};
// Why a source cannot be edited, or null when it can. Generated and subscription sources are never writable, whatever
// the server allows. The contract carries no reason for a main or include file refused on its own, and an engine may
// refuse one for more than one reason: only the engine's adapter can name the secrets it holds as the reason;
// otherwise the file is just read-only. A source without text was not sent at all. A text that does not match its
// digest (`complete` false) had values hidden by the backend; saving it would drop them.
export function readOnlyBadge(
  source: Pick<ConfigSource, 'kind' | 'writable' | 'content'>,
  configWritable: boolean,
  complete: boolean | undefined,
  engine: Pick<Engine, 'holdsCredentials'>,
  t: Translator
): {reason: ReadOnlyReason; label: string; note: string; help?: Help} | null {
  const reason: ReadOnlyReason | null =
    source.kind === 'generated' || source.kind === 'subscription'
      ? source.kind
      : !configWritable
        ? 'disabled'
        : !source.writable
          ? engine.holdsCredentials(source)
            ? 'secret'
            : 'refused'
          : source.content === undefined
            ? 'withheld'
            : complete === false
              ? 'redacted'
              : null;
  if (!reason) return null;
  const text = readOnlyText[reason];
  const label = t(text.label);
  return {reason, label, note: t(text.note), ...(text.help && {help: {title: label, text: t(text.help)}})};
}
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
  count: number;
};
type WizardRow = {index: number; name: string; url: string; raw: string | null; nameError?: string; error?: string; description?: string; removeLabel: string};
const tones = {error: 'err', warning: 'warn', info: 'info'} as const;
const levels: Record<ConfigDiagnostic['level'], Key> = {error: 'config.level.error', warning: 'config.level.warning', info: 'config.level.info'};
// Identical diagnostics, such as one warning per duplicate entry at the same place, share one row with their count.
export function diagnosticRows(diagnostics: ConfigDiagnostic[], sources: ConfigSource[], locale: string, t: Translator): DiagnosticRow[] {
  const paths = new Map(sources.map(source => [source.id, fileName(source)]));
  // The key is also the row id, so a selection follows its diagnostic when the polled list changes around it.
  const groups = new Map<string, {item: ConfigDiagnostic; count: number}>();
  for (const item of diagnostics) {
    const key = JSON.stringify([item.level, item.source_id, item.line, item.column, item.code, item.message]);
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, {item, count: 1});
  }
  return [...groups].map(([key, {item, count}]) => {
    const path = paths.get(item.source_id) ?? item.source_id;
    const text = backendMessage(item.code, item.message, t).summary;
    const message = count > 1 ? t('config.repeated', {text, n: formatNumber(count, locale)}) : text;
    // A translated code keeps the backend's own words in the detail, which names the entry the code cannot.
    const described = knownCode(item.code) ? t('config.backendDetail', {text: message, message: item.message}) : message;
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
      detail: item.line === null ? described : t('config.atFile', {file: path, line: formatNumber(item.line, locale), message: described}),
      count
    };
  });
}
export function wizardInitial(content: string): WizardState {
  const read = readState(content);
  return {...read, rules: content.trim() ? 'keep' : defaultTemplate};
}
// The quick setup's form against its file as loaded now. An untouched form follows a file changed on disk; a changed
// one is a conflict the person settles, as a section draft is, since saving would replace text they have not seen.
export function wizardUnder(dirty: boolean, origin: ConfigSource, loaded: ConfigSource): 'follow' | 'conflict' | null {
  if (origin.content_sha256 === loaded.content_sha256) return null;
  return dirty ? 'conflict' : 'follow';
}
// A value the file cannot hold is flagged on its own field, not on every row.
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
              nameError: item.raw === undefined && !isWritableName(item.name.trim()) ? t('config.unquotable') : undefined,
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
  {
    busy,
    complete = true,
    conflict,
    invalid = null,
    changed
  }: {busy: boolean; complete?: boolean | null; conflict: boolean; invalid?: string | null; changed: boolean},
  t: Translator
): string | null {
  if (busy || complete === null) return null;
  if (!complete) return t('config.incomplete');
  if (conflict) return t('config.saveConflict');
  return invalid ?? (changed ? null : t('config.noChanges'));
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
  return t(main?.content !== undefined && isComplete(main) ? 'config.validateOther' : 'config.validateNoMain');
}

// The generation and the revision of the active configuration; the generation is explained, since a reload can
// change the revision and keep it.
export function configMetadata(generation: string, revision: string, t: Translator): KvItem[] {
  return [
    {label: t('config.generation'), value: generation, help: {title: t('config.generation'), text: t('config.generationHelp')}},
    [t('config.revision'), revision]
  ];
}
