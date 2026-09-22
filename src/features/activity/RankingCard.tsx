import {useCallback, useMemo, useState} from 'react';
import {useCapabilities, useConnections} from '../../store';
import {useT} from '../../i18n';
import {usePalette} from '../../ui/Charts';
import {Badge, Bar, Empty, ErrorMessage, Loading, Segmented, TextTooltip} from '../../ui/ui';
import {activityRanking} from './view';

// Top clients owns its own connections subscription: a five-second tick over up to 1,000 connections
// re-renders this card alone, not the traffic charts or the tiles beside it. The poll runs only while the card is
// near the viewport; off screen it is paused and keeps its last list.
export function RankingCard() {
  const t = useT();
  const p = usePalette();
  const [by, setBy] = useState('dev');
  const capabilities = useCapabilities();
  const available = capabilities.data?.resources.connections.available;
  const [near, setNear] = useState(false);
  const ref = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    const observer = new IntersectionObserver(entries => setNear(entries.at(-1)!.isIntersecting), {rootMargin: '400px'});
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Paused only once it has a list to keep showing; before that it loads wherever it is.
  const [loaded, setLoaded] = useState(false);
  const connections = useConnections(undefined, available === true, !near && loaded);
  if (connections.data && !loaded) setLoaded(true);
  const rows = useMemo(() => activityRanking(connections.data, by, p, t), [connections.data, by, p, t]);
  const state = connections.data ? (rows.length ? 'ready' : 'empty') : connections.error ? 'error' : available === true ? 'loading' : 'unavailable';
  return (
    <div className="rp-card" ref={ref}>
      <div className="rp-row">
        <TextTooltip text={t('act.rankingScope')}>
          <h3 className="rp-h3">{t('act.topDevices')}</h3>
        </TextTooltip>
        <Segmented
          label={t('act.topDevices')}
          value={by}
          onChange={setBy}
          items={[
            ['dev', t('act.devices')],
            ['host', t('act.domains')]
          ]}
        />
      </div>
      {connections.error && !connections.data && <ErrorMessage error={connections.error} />}
      {connections.data?.truncated && (
        <TextTooltip text={t('act.rankingTruncated')}>
          <Badge tone="warn">{t('act.truncated')}</Badge>
        </TextTooltip>
      )}
      {state === 'error' ? null : state === 'loading' ? (
        <div className="rp-chart-wait bars">
          <Loading>{t('act.loading')}</Loading>
        </div>
      ) : state === 'unavailable' ? (
        <div className="rp-chart-wait bars">
          <Empty>{t('shell.notOfferedShort')}</Empty>
        </div>
      ) : state === 'empty' ? (
        <div className="rp-chart-wait bars">
          <Empty>{t('act.rankingEmpty')}</Empty>
        </div>
      ) : (
        <div className="rp-list">
          {rows.map(row => (
            <Bar key={row.name} label={row.name} value={row.value} pct={row.pct} color={row.color} />
          ))}
        </div>
      )}
    </div>
  );
}
