import {useContext} from 'react';
import {useNearViewport} from '../../ui/ui';
import {ResourcePreview} from '../../store/preview';
import {useT} from '../../i18n';
import {useCapabilities} from '../../store';
import {WidgetSection} from '../../ui/WidgetPanel';
import {SamplePreview} from './SamplePreview';
import {Contents} from './Contents';
import {available, registry, type Widget} from './layout';
export function WidgetContent({
  item,
  preview = false,
  dashboard = false,
  sample = false,
  onChange
}: {
  item: Widget;
  preview?: boolean;
  dashboard?: boolean;
  sample?: boolean;
  onChange?: (item: Widget) => void;
}) {
  const inherited = useContext(ResourcePreview);
  const [ref, visible] = useNearViewport(undefined, 0);
  return (
    <div ref={ref} className="rp-module-content" data-size={item.size} inert={preview || inherited || sample}>
      <ResourcePreview value={preview || inherited || !visible}>
        {sample ? (
          <SamplePreview id={item.id}>
            <Content item={item} dashboard={dashboard} sample />
          </SamplePreview>
        ) : (
          <Content item={item} dashboard={dashboard} onChange={onChange} />
        )}
      </ResourcePreview>
    </div>
  );
}
function Content({item, dashboard, sample = false, onChange}: {item: Widget; dashboard: boolean; sample?: boolean; onChange?: (item: Widget) => void}) {
  const t = useT();
  const capabilities = useCapabilities().data;
  const memoryMetrics = capabilities?.resources.runtime_memory?.metrics ?? [];
  const singleMemory = item.id === 'memory' && memoryMetrics.filter(metric => metric === 'process.rss_bytes' || metric === 'cgroup.current_bytes').length === 1;
  return (
    <WidgetSection
      label={t(registry[item.id].label)}
      hideLabel={
        dashboard || item.size === 'small' || singleMemory || ['connections', 'cpu', 'global', 'group'].includes(item.id) || (item.id === 'divider' && !sample)
      }
    >
      {sample || available(item.id, capabilities) ? (
        <Contents item={item} dashboard={dashboard} onChange={onChange} />
      ) : (
        <span className="rp-label">{t(capabilities ? 'widgets.unavailable' : 'ui.loading')}</span>
      )}
    </WidgetSection>
  );
}
