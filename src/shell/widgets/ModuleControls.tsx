import {useT} from '../../i18n';
import {useCapabilities, useGroups} from '../../store';
import {Button, ChoiceMenu, Segmented} from '../../ui/ui';
import {WidgetGalleryTile} from '../../ui/WidgetGalleryTile';
import {EditorOption} from '../../ui/EditorOption';
import {ResourcePreview} from '../../store/preview';
import {SamplePreview} from './SamplePreview';
import {dashboardDefaults, dashboardItems} from './dashboardLayout';
import {WidgetCard} from './Dashboard';
import {WidgetContent} from './WidgetContent';
import {maxInstances} from './instances';
import {
  canonicalForm,
  defaultWidget,
  formsFor,
  instanceId,
  onlyPanel,
  registry,
  type ModuleForm,
  type ModuleSize,
  type Surface,
  type Widget,
  type WidgetId
} from './layout';

export function ModuleGallery({items, add, surface = 'panel'}: {items: Widget[]; add: (id: WidgetId) => void; surface?: Surface}) {
  const t = useT();
  return (Object.keys(registry) as WidgetId[])
    .filter(id => surface === 'panel' || !onlyPanel(id))
    .map(id => {
      const n = items.filter(item => item.id === id).length;
      return (
        <WidgetGalleryTile
          key={id}
          id={id}
          label={t(registry[id].label)}
          added={n >= maxInstances}
          addLabel={t('widgets.add')}
          count={t('widgets.placedCount', {n, max: maxInstances})}
          onAdd={() => add(id)}
        >
          <SamplePreview id={id}>
            {surface === 'dashboard' ? (
              <ResourcePreview value>
                <WidgetCard item={dashboardItems(dashboardDefaults()).find(item => item.id === id) ?? defaultWidget(id)} preview />
              </ResourcePreview>
            ) : (
              <WidgetContent item={defaultWidget(id)} preview sample />
            )}
          </SamplePreview>
        </WidgetGalleryTile>
      );
    });
}
const formLabels = {
  area: 'dashboard.form.area',
  sparkline: 'dashboard.form.sparkline',
  donut: 'dashboard.form.donut',
  waffle: 'dashboard.form.waffle',
  dots: 'dashboard.form.dots',
  ranked: 'dashboard.form.ranked',
  kv: 'dashboard.form.kv',
  facts: 'dashboard.form.facts'
} as const;
const sizeLabels = {small: 'widgets.small', medium: 'widgets.medium', large: 'widgets.large', wide: 'dashboard.wide'} as const;
export function ModuleInspector({
  active,
  items,
  sizes,
  surface,
  update,
  move,
  remove
}: {
  active?: Widget;
  items: Widget[];
  sizes: readonly ModuleSize[];
  surface: Surface;
  update: (item: Widget) => void;
  move: (delta: -1 | 1) => void;
  remove: () => void;
}) {
  const t = useT();
  if (!active) return <p className="rp-label">{t('widgets.select')}</p>;
  return (
    <>
      {sizes.length > 1 && (
        <EditorOption label={t('widgets.size')}>
          <Segmented
            label={t('widgets.size')}
            value={active.size}
            onChange={size =>
              update({
                ...active,
                size: size as ModuleSize,
                form: surface === 'panel' && size === 'small' && formsFor(active.id, surface).includes('kv') ? 'kv' : active.form
              })
            }
            items={sizes.map(size => [size, t(sizeLabels[size])])}
          />
        </EditorOption>
      )}
      {formsFor(active.id, surface).length > 1 && !(active.size === 'small' && formsFor(active.id, surface).includes('sparkline')) && (
        <EditorOption label={t('widgets.form', {name: t(registry[active.id].label)})}>
          <Segmented
            label={t('widgets.form', {name: t(registry[active.id].label)})}
            value={canonicalForm(active, surface)}
            onChange={form => update({...active, form: form as ModuleForm})}
            items={formsFor(active.id, surface).map(form => [form, t(formLabels[form])])}
          />
        </EditorOption>
      )}
      {active.id === 'ranking' && (
        <EditorOption label={t('widgets.rankBy')}>
          <Segmented
            label={t('widgets.rankBy')}
            value={active.by ?? 'dev'}
            onChange={by => update({...active, by: by === 'domain' ? 'domain' : 'dev'})}
            items={[
              ['dev', t('widgets.devices')],
              ['domain', t('widgets.domains')]
            ]}
          />
        </EditorOption>
      )}
      {['nodeLatency', 'policyGroups', 'latency'].includes(active.id) && <GroupOption item={active} update={update} />}
      <div className="rp-cluster rp-module-actions">
        <Button isDisabled={instanceId(items[0]) === instanceId(active)} onPress={() => move(-1)}>
          {t('widgets.up')}
        </Button>
        <Button isDisabled={instanceId(items.at(-1)!) === instanceId(active)} onPress={() => move(1)}>
          {t('widgets.down')}
        </Button>
        <Button negative onPress={remove}>
          {t('widgets.remove')}
        </Button>
      </div>
    </>
  );
}
function GroupOption({item, update}: {item: Widget; update: (item: Widget) => void}) {
  const capabilities = useCapabilities();
  const groups = useGroups(capabilities.data?.resources.groups.available === true);
  const t = useT();
  const automatic = t(item.id === 'latency' ? 'act.groupFollow' : 'dashboard.allGroups');
  return (
    <EditorOption label={t('ui.group')}>
      <ChoiceMenu
        label={t('ui.group')}
        value={item.group ?? ''}
        items={[{id: '', label: automatic}, ...(groups.data ?? []).map(group => ({id: group.id, label: group.name}))]}
        onChange={group => update({...item, group})}
      >
        {groups.data?.find(group => group.id === item.group)?.name ?? automatic}
      </ChoiceMenu>
    </EditorOption>
  );
}
