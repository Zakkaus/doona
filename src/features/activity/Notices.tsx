type NoticesModel = {
  rows: Array<{id: string; tone: 'warn' | 'info'; kindText: string; summaryText: string}>;
  total: number;
  error: Error | null;
  retry: () => void;
  loading: boolean;
  empty: string;
};
import {useT} from '../../i18n';
import {href} from '../../shell/route';
import {Empty, ErrorMessage, Light, Link, Loading, TextTooltip} from '../../ui/ui';

export function Notices({rows, total, error, retry, loading, empty}: NoticesModel) {
  const t = useT();
  return (
    <section className="rp-card" aria-label={t('act.issues')}>
      {/* One line in every state: the count appearing must not wrap the header and grow the row. */}
      <div className="rp-row nowrap">
        <div className="rp-cluster nowrap">
          <h3 className="rp-h3 rp-grow">
            <TextTooltip>{t('act.issues')}</TextTooltip>
          </h3>
          {total > 0 && <span className="rp-label">{total}</span>}
        </div>
        <Link appearance="button" className="quiet sm" href={href('events')}>
          {t('act.viewAll')}
        </Link>
      </div>
      {error && <ErrorMessage error={error} onRetry={retry} />}
      {loading ? (
        <div className="rp-chart-wait">
          <Loading />
        </div>
      ) : rows.length === 0 ? (
        <div className="rp-chart-wait">
          <Empty>{empty}</Empty>
        </div>
      ) : (
        <div className="rp-list rp-feed" role="list">
          {rows.map(row => (
            <div key={row.id} role="listitem" className="rp-row">
              <Light small tone={row.tone}>
                {row.kindText}
              </Light>
              <span className="rp-note rp-grow">{row.summaryText}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
