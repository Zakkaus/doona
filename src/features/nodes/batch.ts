import type {Translator} from '../../i18n';
import {nodeFormReason, nodeLinkError} from './view';

export function parseNodeLinks(value: string, existing: string[], t: Translator, schemes?: readonly string[] | null) {
  const links = value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const used = new Set(existing);
  const rows = links.slice(0, 200).map((link, id) => {
    let name = '',
      host = '';
    try {
      host = new URL(link).hostname;
    } catch {}
    try {
      name = decodeURIComponent(link.split('#').slice(1).join('#')).trim();
    } catch {}
    const base = name || host || link.split(':', 1)[0];
    name = base;
    for (let suffix = 2; used.has(name); suffix++) name = `${base}-${suffix}`;
    used.add(name);
    const error = nodeLinkError(link, t, schemes) ?? nodeFormReason('node', name, link, t);
    const errorSummary = !error
      ? null
      : error === t('nodes.linkInvalid')
        ? t('nodes.batchLinkInvalid')
        : error === t('config.unquotable')
          ? t('nodes.batchUnquotable')
          : error === t('nodes.nameMissing')
            ? error
            : t('nodes.batchLinkTooLong');
    return {id: String(id), link, name, scheme: link.split(':', 1)[0], error, errorSummary};
  });
  return {rows, multiple: links.length > 1, error: links.length > 200 ? t('nodes.batchLimit') : null};
}
