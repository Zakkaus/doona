import {Suspense, type ComponentProps} from 'react';
import {useT} from '../../i18n';
import {useTraceForm} from './useTraceForm';
import {ErrorMessage, PageSkeleton, Tabs, type PageShape} from '../../ui/ui';
import {LoadBoundary} from '../../ui/LoadBoundary';
import {preloadable} from '../../ui/preloadable';
import {RuleList} from './RuleList';
import {DnsRules} from './DnsRules';
import type {PageProps} from '../../shell/routes';
import {useRulesPage} from './useRulesPage';
import type {Trace as TracePanel} from './Trace';

// The trace tab's code loads when its tab is pointed at or focused, so choosing it shows the form at once; a link
// straight to the tab draws its form card's Skeleton until then.
const trace = preloadable<ComponentProps<typeof TracePanel>>(() => import('./Trace').then(module => ({default: module.Trace})));
const preloadTrace = () => void trace.preload().catch(() => undefined);
const traceForm: PageShape = [{cards: [194]}];

export function Rules(props: PageProps) {
  const t = useT();
  const view = useRulesPage(props);
  const form = useTraceForm(props.query);
  const content = {
    list: <RuleList {...props} />,
    dns: <DnsRules {...props} />,
    trace: (
      <LoadBoundary>
        <Suspense fallback={<PageSkeleton panel shape={traceForm} />}>
          <trace.Component form={form} go={props.go} />
        </Suspense>
      </LoadBoundary>
    )
  };
  if (view.loading) return <PageSkeleton />;
  if (view.error) return <ErrorMessage error={view.error} onRetry={view.retry} />;
  return (
    <div className="rp-page">
      <Tabs
        page
        label={t('nav.rules')}
        items={view.tabs.map(tab => ({...tab, content: content[tab.id], onIntent: tab.id === 'trace' ? preloadTrace : undefined}))}
        value={view.tab}
        onChange={view.changeTab}
      />
    </div>
  );
}
