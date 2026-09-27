import {useMemo} from 'react';
import {getApi} from '../../api';
import {refetchAll, reopenEvents, useNoticeFeed} from '../../store';
import {useT} from '../../i18n';
import {interestingNotice, noticeRows} from './view';

export function useNotices() {
  const t = useT();
  const api = getApi();
  const feed = useNoticeFeed(interestingNotice);
  const rows = useMemo(() => noticeRows(feed.records, t), [feed.records, t]);
  return {
    rows,
    total: feed.records.length,
    error: feed.error,
    // A failed stream reopens once the capabilities are read again.
    retry: () => void refetchAll().then(() => reopenEvents(api)),
    loading: !feed.error && feed.available === null,
    empty: t(feed.available === false ? 'event.unavailable' : 'act.noIssues')
  };
}
