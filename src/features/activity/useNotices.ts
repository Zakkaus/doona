import {useMemo} from 'react';
import {getApi} from '../../api';
import {offered} from '../../api/capabilities';
import {noNodeSources} from '../../api/selectors';
import {holdsRouting} from '../../dae/setup';
import {refetchAll, reopenEvents, useCapabilities, useConfig, useNodes, useNoticeFeed, useProviders} from '../../store';
import {useT} from '../../i18n';
import {interestingNotice, noticeRows, setupNotices} from './view';

export function useNotices() {
  const t = useT();
  const api = getApi();
  const feed = useNoticeFeed(interestingNotice);
  const resources = useCapabilities().data?.resources;
  const providers = useProviders(offered(resources, 'providers', {whileLoading: false}));
  const nodes = useNodes(offered(resources, 'nodes', {whileLoading: false}));
  const config = useConfig(offered(resources, 'config', {whileLoading: false}));
  // Routing is judged only from files read in full: a redacted or unread file may hold it.
  const written = config.data?.sources.filter(source => source.kind === 'main' || source.kind === 'include');
  const setup = setupNotices(
    {
      noNodeSources: noNodeSources(providers.data?.providers, nodes.data),
      noRouting: !!written && written.every(source => source.content !== undefined) && !holdsRouting(written.map(source => source.content!))
    },
    t
  );
  const notices = useMemo(() => noticeRows(feed.records, t), [feed.records, t]);
  return {
    rows: [...setup, ...notices.rows],
    total: setup.length + notices.total,
    error: feed.error,
    // A failed stream reopens once the capabilities are read again.
    retry: () => void refetchAll().then(() => reopenEvents(api)),
    loading: !feed.error && feed.available === null,
    empty: t(feed.available === false ? 'event.unavailable' : 'act.noIssues')
  };
}
