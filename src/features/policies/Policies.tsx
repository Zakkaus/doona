import {memo, Suspense, type ComponentProps, type ReactNode} from 'react';
import type {Arrange as ArrangeTab} from './arrange/Arrange';
import {preloadable} from '../../ui/preloadable';
import {useT} from '../../i18n';
import Refresh from '../../ui/icons/Refresh';
import {Badge, Button, Disclosure, DisclosureGroup, ErrorMessage, Light, Loading, Kv, Segmented, Switch, Empty, Tabs} from '../../ui/ui';
import {NodeGrid} from './Nodes';
import {PolicyEdit} from './PolicyEdit';
import type {PageProps} from '../../shell/routes';
import {usePolicies, usePolicyVisibility} from './usePolicies';
import {usePolicyGroup, type PolicyGroupInput} from './usePolicyGroup';

// The arrange tab and its drag and drop are a chunk of their own, fetched as soon as this page's module loads (in idle
// time, like the page itself), so opening the tab later does not wait.
const arrange = preloadable<ComponentProps<typeof ArrangeTab>>(() => import('./arrange/Arrange').then(module => ({default: module.Arrange})));
const Arrange = arrange.Component;
void arrange.preload().catch(() => undefined);

// Holds roughly the loaded card's height, so cards below do not move when the details arrive.
function PolicyWait({heading, members, label}: {heading: ReactNode; members: number; label?: string}) {
  return (
    <>
      <div className="rp-row">{heading}</div>
      <div className="rp-wait-line" />
      <div className="rp-form" role={label ? 'status' : undefined} aria-label={label}>
        {members > 12 ? (
          <>
            <div className="rp-wait-line" />
            <div className="rp-nodegrid" />
          </>
        ) : (
          <div className="rp-nodes">
            {Array.from({length: Math.max(members, 1)}, (_, i) => (
              <span key={i} className="rp-node" />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
function PolicyDetail(props: PolicyGroupInput) {
  const t = useT();
  const m = usePolicyGroup(props);
  const g = m.card;
  return (
    <>
      <ErrorMessage error={m.error} onRetry={m.retry} />
      {m.loading && <PolicyWait heading={<h3 className="rp-h3">{props.name}</h3>} members={props.members} label={m.loadingText} />}
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
                <Refresh className="rp-spin-on-press" />
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
const PolicyCard = memo(function PolicyCard({focused, domId, ...props}: Omit<PolicyGroupInput, 'paused'> & {focused: boolean; domId: string}) {
  const {ref, active, visible, expand} = usePolicyVisibility(focused);
  return (
    <section ref={ref} className="rp-card" id={domId} aria-label={props.name} tabIndex={-1}>
      {active ? (
        <PolicyDetail {...props} paused={!visible} />
      ) : (
        <PolicyWait
          heading={
            <Button quiet onPress={expand}>
              {props.name}
            </Button>
          }
          members={props.members}
        />
      )}
    </section>
  );
});
export function Policies(props: PageProps) {
  const t = useT();
  const m = usePolicies(props);
  const groups = (
    <>
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
    </>
  );
  return (
    <div className="rp-page">
      <Tabs
        keepMounted
        label={t('nav.policies')}
        value={m.tab}
        onChange={m.setTab}
        items={[
          {id: 'groups', label: t('policy.tab.groups'), content: groups},
          {
            id: 'arrange',
            label: t('policy.tab.arrange'),
            content: (
              <Suspense fallback={<Loading />}>
                <Arrange source={m.source} groups={m.groups} />
              </Suspense>
            )
          }
        ]}
      />
    </div>
  );
}
