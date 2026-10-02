import Edit from '../../ui/icons/Edit';
import AddCircle from '../../ui/icons/AddCircle';
import {FilterSummary} from '../shared/FilterSummary';
import {
  createContext,
  Fragment,
  memo,
  useCallback,
  use,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode
} from 'react';
import {useT} from '../../i18n';
import {
  ActionHelp,
  Badge,
  Button,
  Card,
  HelpRow,
  Disclosure,
  ErrorMessage,
  IconTip,
  Light,
  Loading,
  Segmented,
  Empty,
  Tag,
  Tags,
  LinkTag,
  TextTooltip,
  MoreMenu
} from '../../ui/ui';
import Lock from '../../ui/icons/Lock';
import {NodeName} from '../../ui/NodeName';
import {NodeText} from '../shared/NodeText';
import {NodeGrid} from './Nodes';
import {GroupDialog} from '../shared/GroupDialog';
import {CheckEdit} from './CheckEdit';
import type {PageProps} from '../../shell/routes';
import {usePolicies, usePolicyVisibility} from './usePolicies';
import {usePolicyGroup, type PolicyGroupInput} from './usePolicyGroup';
import {useGroupDialog, type PolicyDeclaration} from '../shared/useGroupDialog';
import type {MainSourceEdit} from '../../store/mainSource';
import type {OutboundCatalogue} from '../shared/groupText';
import {isWritableName, quoteName} from '../../dae/groups';

// Holds roughly the loaded card's height, so cards below do not move when the details arrive. A collapsed automatic
// group holds its summary line alone.
function PolicyWait({heading, members, label, collapsed}: {heading: ReactNode; members: number; label?: string; collapsed?: boolean}) {
  if (collapsed)
    return (
      <>
        <div className="rp-row">{heading}</div>
        <div className="rp-wait-line" role={label ? 'status' : undefined} aria-label={label} />
      </>
    );
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
// The cards that open on screen when the list first shows hold it back until their group's read arrives. A card's
// heading, toolbar and tiles depend on the group's capabilities and its members' health, which the groups list does
// not carry, so no placeholder can know the loaded card's height; the list is laid out hidden behind the loading state
// instead, and shown once. Cards reached later by scrolling open off screen behind a placeholder.
type FirstShowGate = {hold: (id: string) => void; release: (id: string) => void};
const FirstShow = createContext<FirstShowGate>({hold() {}, release() {}});
function PolicyList({loading, children}: {loading: boolean; children: ReactNode}) {
  const waiting = useRef(new Set<string>());
  const [shown, setShown] = useState(false);
  const [checks, recheck] = useReducer((n: number) => n + 1, 0);
  const gate = useMemo<FirstShowGate>(
    () => ({
      hold: id => void waiting.current.add(id),
      release: id => {
        if (waiting.current.delete(id) && !waiting.current.size) recheck();
      }
    }),
    []
  );
  // A parent's layout effect runs after its cards' refs and layout effects in the same commit, so every card that
  // opened on screen has already asked to be waited for.
  useLayoutEffect(() => {
    if (!shown && !loading && !waiting.current.size) setShown(true);
  }, [shown, loading, checks]);
  useEffect(() => {
    if (shown || loading) return;
    const timeout = setTimeout(() => setShown(true), 3000);
    return () => clearTimeout(timeout);
  }, [shown, loading]);
  return (
    <FirstShow value={gate}>
      <div className="rp-policy-list" data-wait={shown ? undefined : ''}>
        {!shown && <Loading />}
        {children}
      </div>
    </FirstShow>
  );
}
function PolicyDetail(props: PolicyGroupInput & {kind: 'manual' | 'auto'}) {
  const t = useT();
  const m = usePolicyGroup(props);
  const g = m.card;
  const gate = use(FirstShow);
  const {id, paused} = props;
  // A card scrolled away stops reading its group, so it no longer holds the list.
  useLayoutEffect(() => {
    if (!m.loading || paused) {
      gate.release(id);
      return;
    }
    gate.hold(id);
    return () => gate.release(id);
  }, [gate, id, m.loading, paused]);
  const network = g?.showNetwork && (
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
  );
  const pin = g?.pinned && (
    <Light small tone="neutral">
      {t('policy.overridden')}
    </Light>
  );
  const grid = g && <NodeGrid nodes={m.members} selected={g.selected} cur={g.selected} marks={g.marks} isDisabled={m.busy} onSelect={m.select} />;
  return (
    <>
      <ErrorMessage error={m.error} onRetry={m.retry} />
      {m.loading && (
        <PolicyWait
          heading={
            <h2 className="rp-h3" tabIndex={-1}>
              {props.name}
            </h2>
          }
          members={props.members}
          label={m.loadingText}
          collapsed={props.kind === 'auto' && !props.focused}
        />
      )}
      {g && (
        <>
          {/* A long name gives way, truncating, so the More menu keeps its place on the title row. */}
          <ActionHelp reason={!m.edit.editable || m.edit.disabled ? m.edit.tip : null}>
            <div className="rp-row nowrap">
              <span className="rp-cluster rp-grow">
                <h2 className="rp-h3" tabIndex={-1}>
                  <TextTooltip>{g.name}</TextTooltip>
                </h2>
                {m.actionsReason && (
                  <IconTip label={t('policy.lockHelp', {name: g.name})} text={m.actionsReason}>
                    <Lock />
                  </IconTip>
                )}
                <Badge tip={g.policy.id}>{g.policy.label}</Badge>
                <Light small tone="ok">
                  {g.healthy}
                </Light>
                {g.down && (
                  <Light small tone="err">
                    {g.down}
                  </Light>
                )}
                {g.untested && (
                  <HelpRow help={m.untestedHelp}>
                    <Light small tone="neutral">
                      {g.untested}
                    </Light>
                  </HelpRow>
                )}
              </span>
              <Button quiet icon small label={t('policy.edit')} isDisabled={!m.edit.editable || m.edit.disabled} onPress={() => m.edit.show()}>
                <Edit />
              </Button>
              <GroupDialog id={g.id} model={m.edit} details={m.details} />
              <CheckEdit model={m.check} />
              <MoreMenu
                actions={[
                  ...(!m.edit.editable ? [{id: 'config', label: t('policy.viewConfig'), onAction: m.edit.view}] : []),
                  ...(m.check.available ? [{id: 'check', label: t('policy.checkEdit'), isDisabled: m.check.busy, onAction: m.check.show}] : []),
                  {id: 'probe', label: m.probeText, isPending: m.probing, isDisabled: m.probeDisabled, reason: m.probeTip, onAction: m.probe},
                  ...(g.pinned ? [{id: 'release', label: t('policy.releaseOverride'), isPending: m.releasing, isDisabled: m.busy, onAction: m.release}] : [])
                ]}
              />
            </div>
          </ActionHelp>
          {m.includes.tags.length > 0 && (
            <Tags label={t('policy.includes')}>
              {m.includes.tags.map(tag => (
                <Fragment key={tag.id}>
                  {tag.href ? <LinkTag href={tag.href}>{tag.label}</LinkTag> : <Tag>{tag.nodeName ? <NodeName name={tag.label} /> : tag.label}</Tag>}
                </Fragment>
              ))}
            </Tags>
          )}
          {m.includes.filters && <FilterSummary filters={m.includes.filters} />}
          {g.automatic ? (
            // An automatic group chooses for itself, so its members fold under a one-line summary; a pinned member keeps
            // its light beside the summary while they are folded.
            <Disclosure title={<NodeText text={m.summaryText} names={m.members} />} aside={pin} isExpanded={m.expanded} onExpandedChange={m.setExpanded}>
              {network && <div className="rp-toolbar">{network}</div>}
              {grid}
            </Disclosure>
          ) : (
            <>
              {(network || pin) && (
                <div className="rp-toolbar">
                  {network}
                  {pin}
                </div>
              )}
              {grid}
            </>
          )}
        </>
      )}
    </>
  );
}
type PolicyCardProps = Omit<PolicyGroupInput, 'paused'> & {domId: string; kind: 'manual' | 'auto'};
const PolicyCard = memo(function PolicyCard({domId, ...props}: PolicyCardProps) {
  const gate = use(FirstShow);
  const {id} = props;
  // Opening on screen happens in the card's ref, before its details mount and hold the list themselves.
  const hold = useCallback(() => gate.hold(id), [gate, id]);
  // A card removed before its details mount does not hold the list.
  useLayoutEffect(() => () => gate.release(id), [gate, id]);
  const {focused} = props;
  const [highlight, setHighlight] = useState({focused, active: focused});
  if (highlight.focused !== focused) setHighlight({focused, active: focused});
  useEffect(() => {
    const timer = setTimeout(() => setHighlight(previous => ({...previous, active: false})), 3000);
    return () => clearTimeout(timer);
  }, [focused]);
  const {ref, active, visible, expand} = usePolicyVisibility(focused, hold);
  return (
    <Card ref={ref} id={domId} aria-label={props.name} tabIndex={-1} isHighlighted={highlight.active}>
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
          collapsed={props.kind === 'auto' && !focused}
        />
      )}
    </Card>
  );
});

function DeclaredPolicy({
  name,
  declaration,
  source,
  outbounds,
  editRequested,
  seedNode,
  editorOpened
}: {
  name: string;
  declaration: PolicyDeclaration;
  source: MainSourceEdit;
  outbounds: OutboundCatalogue;
  editRequested: boolean;
  seedNode?: string;
  editorOpened: () => void;
}) {
  const t = useT();
  const edit = useGroupDialog({mode: 'edit', name, source, declaration, context: {g: undefined, members: [], outbounds}});
  const openRequested = useEffectEvent(() => {
    edit.show(seedNode && isWritableName(seedNode) ? [`name(${quoteName(seedNode)})`] : []);
    editorOpened();
  });
  useEffect(() => {
    if (editRequested && edit.editable && !edit.open) openRequested();
  }, [editRequested, edit.editable, edit.open]);
  return (
    <Card aria-label={name}>
      <ActionHelp reason={!edit.editable || edit.disabled ? edit.tip : null}>
        <div className="rp-row nowrap">
          <h2 className="rp-h3 rp-grow">{name}</h2>
          <Button quiet icon small label={t('policy.edit')} isDisabled={!edit.editable || edit.disabled} onPress={() => edit.show()}>
            <Edit />
          </Button>
        </div>
      </ActionHelp>
      <GroupDialog id={'declared-' + name} model={edit} details={null} />
    </Card>
  );
}
export function Policies(props: PageProps) {
  const t = useT();
  const m = usePolicies(props);
  const groups = (
    <>
      <p className="rp-note">{t('policy.note')}</p>
      <ErrorMessage error={m.error} onRetry={m.reload} />
      {m.empty && <Empty>{t('policy.empty')}</Empty>}
      {m.kindEmpty && <Empty>{m.kindEmpty}</Empty>}
      <PolicyList loading={m.loading}>
        <div className="rp-col">
          {m.cards.map(card => (
            <PolicyCard
              key={card.id}
              {...card}
              focused={m.focus === card.id}
              nodes={m.nodes}
              providers={m.providers}
              editRequested={m.focus === card.id && m.editRequested}
              seedNode={m.seedNode}
              editorOpened={m.editorOpened}
              health={m.health}
              outbounds={m.outbounds}
              source={m.source}
              refreshGroups={m.refreshGroups}
              refreshNodes={m.refreshNodes}
            />
          ))}
          {m.declarations.map(group => (
            <DeclaredPolicy
              key={group.name}
              {...group}
              source={m.source}
              outbounds={m.outbounds}
              editRequested={m.focus === group.name && m.editRequested}
              seedNode={m.seedNode}
              editorOpened={m.editorOpened}
            />
          ))}
        </div>
      </PolicyList>
    </>
  );
  return (
    <div className="rp-page">
      <ActionHelp reason={m.createDisabled ? m.create.tip : null}>
        <div className="rp-toolbar">
          {m.showKinds && <Segmented label={m.kindLabel} value={m.kind} onChange={m.setKind} items={m.kindItems} />}
          <span className="rp-grow" />
          <Button secondary isDisabled={m.createDisabled} onPress={() => m.create.show()}>
            <AddCircle />
            {t('group.newGroup')}
          </Button>
        </div>
      </ActionHelp>
      <GroupDialog id="policies-create" model={m.create} details={null} />
      {groups}
    </div>
  );
}
