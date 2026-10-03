import {DeferredLoading} from './DeferredLoading';
import {useT} from '../../i18n';
import {Badge, Bar, Card, ChartWait, columns, Empty, ErrorMessage, Link, Segmented, TextTooltip} from '../../ui/ui';
import type {useRankingCard} from './useRankingCard';

export function RankingCard({model}: {model: ReturnType<typeof useRankingCard>}) {
  const t = useT();
  const {ref, by, setBy, rows, state, error, retry, truncated} = model;
  return (
    <Card ref={ref}>
      <div className="rp-row">
        <TextTooltip text={t('act.rankingScope')}>
          <h2 className="rp-h3">{t('act.topDevices')}</h2>
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
      {error && <ErrorMessage error={error} onRetry={retry} />}
      {truncated && (
        <TextTooltip text={t('act.rankingTruncated')}>
          <Badge tone="warn">{t('act.truncated')}</Badge>
        </TextTooltip>
      )}
      {state === 'error' ? null : state === 'loading' ? (
        <ChartWait holds="bars">
          <DeferredLoading>{t('ui.loading')}</DeferredLoading>
        </ChartWait>
      ) : state === 'unavailable' ? (
        <ChartWait holds="bars">
          <Empty>{t('act.noConnections')}</Empty>
        </ChartWait>
      ) : state === 'empty' ? (
        <ChartWait holds="bars">
          <Empty>{t('act.rankingEmpty')}</Empty>
        </ChartWait>
      ) : (
        <div className="rp-list rp-columns" style={columns(rows.length)}>
          {rows.map(row => (
            <Bar
              key={row.name}
              label={
                <Link appearance="link" href={row.href}>
                  {row.name}
                </Link>
              }
              value={row.value}
              pct={row.pct}
              color={row.color}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
