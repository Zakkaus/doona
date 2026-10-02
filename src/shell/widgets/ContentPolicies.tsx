import {useT} from '../../i18n';
import {useGroups, useGroupControl} from '../../store';
import {useMode} from '../../features/shared/useMode';
import {ModeSwitch} from '../../features/activity/widgets';
import {selectMember} from '../../features/shared/selectMember';
import {Button, ChoiceMenu, Empty, ErrorMessage, Kv, Link, Segmented} from '../../ui/ui';
import {WidgetRow} from '../../ui/WidgetPanel';
import {href} from '../route';
import type {Widget} from './layout';
import {Reading} from './Reading';

export function ModeWidget({preview, targetOnly}: {preview: boolean; targetOnly: boolean}) {
  const t = useT();
  const m = useMode();
  return (
    <>
      <ErrorMessage error={m.error} onRetry={m.retry} />
      {!targetOnly && <ModeSwitch model={{...m, writable: !preview && m.writable}} />}
      {(targetOnly || m.mode === 'global') && (
        <WidgetRow label={t('act.global')}>
          <ChoiceMenu
            quiet
            label={t('act.global')}
            value={m.target}
            onChange={m.pickTarget}
            isDisabled={preview || m.busy || !m.writable}
            items={m.targets}
            searchLabel={t('ui.filterOutbounds')}
          >
            {m.targetText}
          </ChoiceMenu>
        </WidgetRow>
      )}
      {m.incomplete && <span className="rp-label">{t('act.globalMissing')}</span>}
    </>
  );
}
// Works without setup: the first manual group until the card picks another; with none, one jump to create a group.
export const cardGroup = <G extends {id: string; policy: {kind: string}}>(groups: readonly G[] | undefined, chosen: string | undefined) =>
  groups?.find(group => group.id === chosen) ?? groups?.find(group => group.policy.kind === 'selector');
export function GroupWidget({item, preview, onChange}: {item: Widget; preview: boolean; onChange?: (item: Widget) => void}) {
  const t = useT();
  const groups = useGroups();
  const selected = cardGroup(groups.data, item.group);
  return (
    <Reading state={groups}>
      {selected ? (
        <>
          <WidgetRow label={t('widgets.group')}>
            <ChoiceMenu
              quiet
              label={t('ui.group')}
              value={selected.id}
              isDisabled={preview || !onChange}
              items={(groups.data ?? []).map(group => ({id: group.id, label: group.name}))}
              onChange={group => onChange?.({...item, group})}
              searchLabel={t('ui.filterGroups')}
            >
              {selected.name}
            </ChoiceMenu>
          </WidgetRow>
          <GroupControl id={selected.id} refresh={groups.refetch} preview={preview} />
        </>
      ) : (
        <Empty>
          {t('widgets.noManualGroup')}
          <Link appearance="button" small href={href('policies', {new: '1'})}>
            {t('group.newGroup')}
          </Link>
        </Empty>
      )}
    </Reading>
  );
}
function GroupControl({id, refresh, preview}: {id: string; refresh: () => unknown; preview: boolean}) {
  const t = useT();
  const control = useGroupControl(id, refresh, () => {});
  const g = control.data;
  const network = control.network;
  const selection = g?.runtime.selection;
  const selected =
    network === 'both' ? (selection?.tcp?.member_id === selection?.udp?.member_id ? selection?.tcp?.member_id : '') : selection?.[network]?.member_id;
  const canSelect = !!g && (g.capabilities.can_select || g.capabilities.can_override);
  const overridden = network === 'both' ? [selection?.tcp, selection?.udp].some(s => s?.source === 'override') : selection?.[network]?.source === 'override';
  const name = (member: string | undefined) => g?.members.find(m => m.id === member)?.name ?? '—';
  return (
    <Reading state={control}>
      <ErrorMessage error={control.actionError} />
      <Segmented
        label={t('widgets.network')}
        value={network}
        onChange={value => control.setNetwork(value as typeof network)}
        isDisabled={preview || !!control.busy}
        items={[
          ['both', t('policy.both')],
          ['tcp', 'TCP'],
          ['udp', 'UDP']
        ]}
      />
      {/* With both networks on different members, the member row has no single value, so each network shows its own. */}
      {selected === '' && (
        <Kv
          compact
          row
          items={[
            ['TCP', name(selection?.tcp?.member_id)],
            ['UDP', name(selection?.udp?.member_id)]
          ]}
        />
      )}
      <WidgetRow label={t('widgets.member')}>
        <ChoiceMenu
          quiet
          searchLabel={t('ui.filterMembers')}
          label={t('widgets.member')}
          value={selected ?? ''}
          isDisabled={preview || !!control.busy || !canSelect}
          items={(g?.members ?? []).map(m => ({id: m.id, label: m.name}))}
          onChange={member => selectMember(control.select, member, selected, g?.name, name, t)}
        >
          {name(selected)}
        </ChoiceMenu>
      </WidgetRow>
      {g?.capabilities.can_override && overridden && (
        <Button small isDisabled={preview} isPending={control.busy === 'selection'} onPress={() => void control.clearOverride()}>
          {t('policy.releaseOverride')}
        </Button>
      )}
      {!canSelect && <span className="rp-label">{t('widgets.readOnly')}</span>}
    </Reading>
  );
}
