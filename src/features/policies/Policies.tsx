import {memo} from 'react';
import {useT} from '../../i18n';
import Refresh from '../../ui/icons/Refresh';
import {Badge, Button, Disclosure, DisclosureGroup, ErrorMessage, Light, Loading, Kv, Segmented, Switch, Empty} from '../../ui/ui';
import {NodeGrid} from './Nodes';
import {PolicyEdit} from './PolicyEdit';
import type {PageProps} from '../types';
import {usePolicies, usePolicyVisibility} from './usePolicies';
import {usePolicyGroup, type PolicyGroupInput} from './usePolicyGroup';

function PolicyDetail(props: PolicyGroupInput) {
  const t = useT();
  const m = usePolicyGroup(props);
  const g = m.card;
  return (
    <>
      <ErrorMessage error={m.error} />
      {m.loading && <Loading>{m.loadingText}</Loading>}
      {g && (
        <>
          <div className="rp-row">
            <span className="rp-cluster">
              <h3 className="rp-h3">{g.name}</h3>
              <Badge>{g.kind}</Badge>
              <Light small tone="ok">
                {g.healthy}
              </Light>
              {g.down && (
                <Light small tone="err">
                  {g.down}
                </Light>
              )}
              {g.untested && (
                <Light small tone="neutral">
                  {g.untested}
                </Light>
              )}
            </span>
            <span className="rp-cluster">
              <PolicyEdit model={m.edit} />
              <Button isPending={m.probing} isDisabled={m.probeDisabled} tip={m.probeTip} onPress={m.probe}>
                <Refresh />
                {m.probeText}
              </Button>
            </span>
          </div>
          <Disclosure id={g.id} title={t('ui.config')}>
            <Kv items={g.fields} />
          </Disclosure>
          <div className="rp-toolbar">
            {g.showNetwork && (
              <Segmented
                label={g.networkLabel}
                value={m.network}
                onChange={m.setNetwork}
                items={[
                  ['both', t('policy.both')],
                  ['tcp', t('ui.tcp')],
                  ['udp', t('ui.udp')]
                ]}
              />
            )}
            {g.overridable && (
              <Light small tone={g.overrideTone}>
                {g.overrideText}
              </Light>
            )}
            {g.pinned && (
              <Button isPending={m.releasing} isDisabled={m.busy} onPress={m.release}>
                {t('policy.releaseOverride')}
              </Button>
            )}
            {g.interruptable && (
              <Switch isSelected={g.interrupt} isDisabled={m.busy} onChange={m.interrupt}>
                {t('policy.interrupt')}
              </Switch>
            )}
          </div>
          <NodeGrid nodes={m.members} selected={g.selected} cur={g.selected} isDisabled={m.busy} onSelect={m.select} />
        </>
      )}
    </>
  );
}
const PolicyCard = memo(function PolicyCard({focused, ...props}: PolicyGroupInput & {focused: boolean}) {
  const {ref, active, expand} = usePolicyVisibility(focused);
  return (
    <section ref={ref} className="rp-card" id={'group-' + props.id} aria-label={props.name}>
      {active ? (
        <PolicyDetail {...props} />
      ) : (
        <Button quiet onPress={expand}>
          {props.name}
        </Button>
      )}
    </section>
  );
});
export function Policies({query}: PageProps) {
  const t = useT();
  const m = usePolicies(query);
  return (
    <div className="rp-page">
      <p className="rp-note">{t('policy.note')}</p>
      <ErrorMessage error={m.error} onRetry={m.reload} />
      {m.loading && <Loading />}
      {m.empty && <Empty>{t('policy.empty')}</Empty>}
      <DisclosureGroup>
        {m.cards.map(card => (
          <PolicyCard
            key={card.id}
            {...card}
            focused={m.focus === card.id}
            health={m.health}
            source={m.source}
            refreshGroups={m.refreshGroups}
            refreshNodes={m.refreshNodes}
          />
        ))}
      </DisclosureGroup>
    </div>
  );
}
