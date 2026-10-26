import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Text} from '@astryxdesign/core/Text';
import {useToast} from '@astryxdesign/core/Toast';
import {VStack} from '@astryxdesign/core/VStack';
import {useEffect, useRef} from 'react';
import {LiteError, errorKey} from './api';
import {useMessages, type MessageKey} from './i18n';
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
// The banner and the toast both read this: a result the client cannot confirm is a warning, even when it arrives as an error.
export function noticeLevel(notice: Notice) {
  const key = 'error' in notice ? errorKey(notice.error) : notice.key;
  return {key, level: warningKeys.has(key) ? 'warning' : 'error' in notice ? 'error' : 'success'} as const;
}

export function Feedback({notice}: {notice?: Notice}) {
  const t = useMessages();
  if (!notice) return null;
  const {key, level} = noticeLevel(notice);
  const detail = 'error' in notice && notice.error instanceof LiteError ? notice.error.detail : undefined;
  return (
    <VStack gap={2}>
      <Banner status={level} title={noticeText(t[key], 'values' in notice ? notice.values : undefined)} collapsible={false} />
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
  const show = useToast();
  const last = useRef<Notice>(undefined);
  useEffect(() => {
    if (!notice || last.current === notice) return;
    last.current = notice;
    const {key, level} = noticeLevel(notice);
    const dismiss = show({
      body: noticeText(t[key], 'values' in notice ? notice.values : undefined),
      type: level === 'error' ? 'error' : 'info',
      isAutoHide: level === 'success'
    });
    return level === 'success' ? undefined : dismiss;
  }, [notice, show, t]);
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
