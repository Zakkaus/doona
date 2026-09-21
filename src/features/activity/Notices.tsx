export type NoticesModel = {
  rows: Array<{id: string; tone: 'warn' | 'info'; kindText: string; summaryText: string}>;
  error: Error | null;
  loading: boolean;
  empty: string;
};
import {useT} from '../../i18n';
import {buildHash} from '../../shell/route';
import {Empty, ErrorMessage, Light, Link, Loading} from '../../ui/ui';

export function Notices({rows, error, loading, empty}: NoticesModel) {
  const t = useT();
  return (
    <section className="rp-card" aria-label={t('act.issues')}>
      <div className="rp-row">
        <div className="rp-cluster">
          <h3 className="rp-h3">{t('act.issues')}</h3>
          {rows.length > 0 && <span className="rp-label">{rows.length}</span>}
        </div>
        <Link appearance="button" className="quiet sm" href={buildHash('events')}>
          {t('act.viewAll')}
        </Link>
      </div>
      {error && <ErrorMessage error={error} />}
      {loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>{empty}</Empty>
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
