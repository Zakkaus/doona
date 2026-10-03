import {DeferredLoading} from './DeferredLoading';
import {useT} from '../../i18n';
import {href} from '../../shell/route';
import {Card, Empty, ErrorMessage, Light, Link, TextTooltip, ChartWait} from '../../ui/ui';
import type {NoticeRow} from './view';

type NoticesModel = {
  rows: NoticeRow[];
  total: number;
  error: Error | null;
  retry: () => void;
  loading: boolean;
  empty: string;
  limit?: number;
};

export function Notices({rows, total, error, retry, loading, empty, limit}: NoticesModel) {
  const t = useT();
  return (
    <Card aria-label={t('act.issues')}>
      {/* One line in every state: the count appearing must not wrap the header and grow the row. */}
      <div className="rp-row nowrap">
        <div className="rp-cluster nowrap">
          <h2 className="rp-h3 rp-grow">
            <TextTooltip>{t('act.issues')}</TextTooltip>
          </h2>
          {total > 0 && <span className="rp-label">{total}</span>}
        </div>
        <Link appearance="button" quiet small href={href('events')}>
          {t('act.viewAll')}
        </Link>
      </div>
      {error && <ErrorMessage error={error} onRetry={retry} />}
      {loading ? (
        <ChartWait>
          <DeferredLoading />
        </ChartWait>
      ) : rows.length === 0 ? (
        <ChartWait>
          <Empty>{empty}</Empty>
        </ChartWait>
      ) : (
        <NoticeList rows={limit === undefined ? rows : rows.slice(0, limit)} label={t('act.issues')} bounded={limit === undefined} />
      )}
    </Card>
  );
}
// The notice rows, each a list item with its kind's light and its summary, ended by its action. A `bounded` list
// scrolls within its card, so it takes keyboard focus.
export function NoticeList({rows, label, bounded = false}: {rows: NoticeRow[]; label: string; bounded?: boolean}) {
  return (
    <div
      className={`rp-list rp-list-labeled${bounded ? ' rp-feed' : ''}`}
      role="list"
      aria-label={label}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The bounded list needs keyboard focus to scroll.
      tabIndex={bounded ? 0 : undefined}
    >
      {rows.map(row => (
        <div key={row.id} role="listitem" className="rp-row">
          <Light small tone={row.tone}>
            {row.kindText}
          </Light>
          {row.action ? (
            /* The action ends the summary's line, so the row keeps the list's two columns. */
            <span className="rp-cluster nowrap">
              <span className="rp-note rp-grow">{row.summaryText}</span>
              <Link appearance="button" quiet small href={row.action.href}>
                {row.action.label}
              </Link>
            </span>
          ) : (
            <span className="rp-note rp-grow">{row.summaryText}</span>
          )}
        </div>
      ))}
    </div>
  );
}
