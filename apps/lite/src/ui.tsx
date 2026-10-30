import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Link} from '@astryxdesign/core/Link';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Text} from '@astryxdesign/core/Text';
import {useToast} from '@astryxdesign/core/Toast';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {useContext, useEffect, useRef} from 'react';
import {LocalError} from '../../../src/api/error';
import {LiteError, errorKey} from './api';
import {docsHref, type DocsAnchor} from './docs';
import {LocaleContext, useMessages, type MessageKey} from './i18n';
import {noticeText, type Notice} from './state';

const warningKeys = new Set<MessageKey>([
  'unknownOutcome',
  'writtenNotRead',
  'degraded',
  'savedDegraded',
  'savedUnconfirmed',
  'notSaved',
  'writtenNotApplied',
  'refreshPartial'
]);
// The docs section that explains how to lift a refusal; an error raised with its own section links that one instead.
const errorDocs: Partial<Record<MessageKey, DocsAnchor>> = {
  readOnly: 'req-config-edit',
  incomplete: 'req-config-edit',
  forbidden: 'sign-in',
  validationUnavailable: 'req-validation',
  invalidConfig: 'req-validation',
  restartRequired: 'reload-and-restart'
};
const operationFailures = new Set(['ui.operationFailed', 'ui.writtenNotApplied']);
// The banner and the toast both read this: a result the client cannot confirm is a warning, even when it arrives as an error.
export function noticeLevel(notice: Notice) {
  const key = 'error' in notice ? errorKey(notice.error) : notice.key;
  const error = 'error' in notice ? notice.error : undefined;
  return {
    key,
    level: warningKeys.has(key) ? 'warning' : 'error' in notice ? 'error' : 'success',
    // The validator's words, or the backend's reason for a failed operation, which the message key leaves out.
    detail:
      error instanceof LiteError ? error.detail : error instanceof LocalError && operationFailures.has(error.key) ? (error.detail ?? undefined) : undefined,
    docs: (error instanceof LiteError ? error.docs : undefined) ?? (error === undefined ? undefined : errorDocs[key])
  } as const;
}

export function DocsLink({anchor}: {anchor: DocsAnchor}) {
  const t = useMessages();
  return (
    <Link href={docsHref(useContext(LocaleContext), anchor)} isExternalLink>
      {t.docsLink}
    </Link>
  );
}

export function ReadOnlyNote({type}: {type?: 'supporting'}) {
  const t = useMessages();
  return (
    <HStack gap={2} wrap="wrap" vAlign="center">
      <Text type={type} color="secondary">
        {t.readOnly}
      </Text>
      <DocsLink anchor="req-config-edit" />
    </HStack>
  );
}

export function Feedback({notice, docs}: {notice?: Notice; docs?: DocsAnchor}) {
  const t = useMessages();
  if (!notice) return null;
  const {key, level, detail, docs: anchor = docs} = noticeLevel(notice);
  return (
    <VStack gap={2}>
      <Banner
        status={level}
        title={noticeText(t[key], 'values' in notice ? notice.values : undefined)}
        description={anchor && <DocsLink anchor={anchor} />}
        collapsible={false}
      />
      {detail && (
        <Text type="supporting" style={{whiteSpace: 'pre-wrap'}}>
          {detail}
        </Text>
      )}
    </VStack>
  );
}

export function useNoticeToast(notice?: Notice) {
  const t = useMessages();
  const locale = useContext(LocaleContext);
  const show = useToast();
  const last = useRef<Notice>(undefined);
  useEffect(() => {
    if (!notice || last.current === notice) return;
    last.current = notice;
    const {key, level, detail, docs} = noticeLevel(notice);
    const text = noticeText(t[key], 'values' in notice ? notice.values : undefined);
    const dismiss = show({
      body: detail ? (
        <VStack gap={1}>
          <Text color="inherit">{text}</Text>
          <Text type="supporting" color="inherit" style={{whiteSpace: 'pre-wrap'}}>
            {detail}
          </Text>
        </VStack>
      ) : (
        text
      ),
      endContent: docs && <Button label={t.docsLink} variant="ghost" size="sm" href={docsHref(locale, docs)} target="_blank" />,
      type: level === 'error' ? 'error' : 'info',
      isAutoHide: level === 'success'
    });
    return level === 'success' ? undefined : dismiss;
  }, [notice, show, t, locale]);
}

export function ReadState({error, reload}: {error: unknown; reload: () => Promise<unknown>}) {
  const t = useMessages();
  if (error === undefined) return null;
  return (
    <VStack gap={3}>
      <Feedback notice={{error}} />
      <Button label={t.retry} variant="secondary" onClick={() => void reload().catch(() => {})} />
    </VStack>
  );
}

export function RefreshProgress({active}: {active: boolean}) {
  const t = useMessages();
  return (
    <VStack aria-hidden={!active} style={{height: 0, position: 'relative', zIndex: 1, visibility: active ? 'visible' : 'hidden'}}>
      <ProgressBar label={t.refresh} isLabelHidden isIndeterminate={active} value={0} />
    </VStack>
  );
}
