import {useContext} from 'react';
import {useNearViewport} from '../../ui/ui';
import {ResourcePreview} from '../../store/preview';
import {useT} from '../../i18n';
import {useCapabilities} from '../../store';
import {WidgetSection} from '../../ui/WidgetPanel';
import {SamplePreview} from './SamplePreview';
import {Contents} from './Contents';
import {available, registry, WidgetSurface, type Widget} from './layout';
import '../../ui/styles/widget-content.css';
export function WidgetContent({
  item,
  preview = false,
  sample = false,
  onChange
}: {
  item: Widget;
  preview?: boolean;
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
            <Content item={item} sample />
          </SamplePreview>
        ) : (
          <Content item={item} onChange={onChange} />
        )}
      </ResourcePreview>
    </div>
  );
}
function Content({item, sample = false, onChange}: {item: Widget; sample?: boolean; onChange?: (item: Widget) => void}) {
  const t = useT();
  const surface = useContext(WidgetSurface);
  const capabilities = useCapabilities().data;
  const memoryMetrics = capabilities?.resources.runtime_memory?.metrics ?? [];
  const singleMemory = item.id === 'memory' && memoryMetrics.filter(metric => metric === 'process.rss_bytes' || metric === 'cgroup.current_bytes').length === 1;
  return (
    <WidgetSection
      label={t(registry[item.id].label)}
      hideLabel={surface === 'dashboard' || item.size === 'small' || singleMemory || registry[item.id].untitled || (item.id === 'divider' && !sample)}
    >
      {sample || available(item.id, capabilities) ? (
        <Contents item={item} onChange={onChange} />
      ) : (
        <span className="rp-label">{t(capabilities ? 'widgets.unavailable' : 'ui.loading')}</span>
      )}
    </WidgetSection>
  );
}
