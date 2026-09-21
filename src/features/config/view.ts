import type {ConfigDiagnostic, ConfigSource} from '../../api/model';
import {formatBytes} from '../../api/u64';
import {localTime} from '../../api/selectors';
import {formatNumber, type Params} from '../../i18n';
import type {Key} from '../../i18n/messages';
import {fileName, redacted} from './names';
import {defaultGroup, defaultTemplate, isSubscriptionUrl, readState, type WizardState} from './wizard';
export type Translate = (key: Key, params?: Params) => string;
const kinds: Record<ConfigSource['kind'], Key> = {
  main: 'config.kind.main',
  include: 'config.kind.include',
  subscription: 'config.kind.subscription',
  generated: 'config.kind.generated'
};
export function sourceView(source: ConfigSource, locale: string, t: Translate): SourceView {
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
export type SourceView = {id: string; label: string; kind: string; editable: string; tone: 'ok' | 'muted'; facts: string; hasContent: boolean};
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
  inline: string;
  detail: string;
};
export type WizardRow = {index: number; name: string; url: string; raw: string | null; error?: string; description?: string; removeLabel: string};
const tones = {error: 'err', warning: 'warn', info: 'info'} as const;
const levels: Record<ConfigDiagnostic['level'], Key> = {error: 'config.level.error', warning: 'config.level.warning', info: 'config.level.info'};
export function diagnosticRows(diagnostics: ConfigDiagnostic[], sources: ConfigSource[], locale: string, t: Translate): DiagnosticRow[] {
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
  return {...read, rules: content.trim() ? 'keep' : defaultTemplate, subscriptions: read.subscriptions.length ? read.subscriptions : [{name: 'sub', url: ''}]};
}
export function wizardRows(state: WizardState, error: string | undefined, t: Translate): {groupUsedText: string; rows: WizardRow[]} {
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
