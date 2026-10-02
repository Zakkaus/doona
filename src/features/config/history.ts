import type {ConfigRevisionList} from '../../api/model';
import type {Translator} from '../../i18n';
import {formatNumber} from '../../i18n';
import {formatBytes, localTime} from '../../i18n/format';

export function historyView(
  list: ConfigRevisionList | undefined,
  store: {recorded: boolean} | undefined,
  canActivate: boolean,
  locale: string,
  t: Translator,
  head?: number | null
) {
  const unrecorded = store?.recorded === false;
  return {
    unrecorded,
    headNumber: head == null ? undefined : formatNumber(head, locale),
    rows: (list?.revisions ?? []).map(revision => ({
      ...revision,
      id: String(revision.revision),
      number: formatNumber(revision.revision, locale),
      head: revision.revision === list?.active,
      canRestore: canActivate && (revision.revision !== list?.active || unrecorded),
      originText:
        revision.origin === 'import'
          ? t('config.revisions.origin.import')
          : revision.origin === 'write'
            ? t('config.revisions.origin.write')
            : revision.origin === 'activate'
              ? t('config.revisions.origin.activate')
              : revision.origin,
      size: formatBytes(revision.bytes, locale),
      metadata: [
        [t('config.revisions.revision'), formatNumber(revision.revision, locale)],
        [t('config.revisions.createdAt'), localTime(revision.created_at, locale)],
        [t('config.revisions.parent'), revision.parent === null ? '—' : formatNumber(revision.parent, locale)],
        [t('config.revisions.principal'), revision.principal],
        [t('config.revisions.hash'), revision.content_sha256]
      ] satisfies [string, string][]
    }))
  };
}
