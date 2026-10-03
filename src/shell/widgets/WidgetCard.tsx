import {lazy, Suspense} from 'react';
import {useT} from '../../i18n';
import {Card} from '../../ui/ui';
import {mainCard} from './dashboardLayout';
import {registry, type Widget} from './layout';
import {scaleOf} from './dashboardSizing';
import {ActivityCard} from '../../features/activity/widgets';
const WidgetContent = lazy(() => import('./WidgetContent').then(module => ({default: module.WidgetContent})));
// The renderer follows the card's kind and display, never its size, so resizing keeps the same content mounted.
export function WidgetCard({item, preview = false, onChange = () => {}}: {item: Widget; preview?: boolean; onChange?: (item: Widget) => void}) {
  const t = useT();
  if (mainCard(item))
    return (
      <ActivityCard
        item={item}
        scale={scaleOf(item)}
        ranking={{by: item.by === 'domain' ? 'host' : 'dev', setBy: by => onChange({...item, by: by === 'host' ? 'domain' : 'dev'})}}
        selection={{chosen: item.group ?? '', setChosen: group => onChange({...item, group})}}
      />
    );
  return (
    <Card title={t(registry[item.id].label)}>
      <Suspense>
        <WidgetContent item={item} dashboard preview={preview} onChange={onChange} />
      </Suspense>
    </Card>
  );
}
