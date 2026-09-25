import '../../../ui/styles/arrange.css';
import {useId, useMemo, useState} from 'react';
import {
  Button as RButton,
  DropZone,
  GridList,
  GridListItem,
  ListLayout,
  Menu,
  Virtualizer,
  isTextDropItem,
  useDragAndDrop,
  type DropItem,
  type Selection
} from 'react-aria-components';
import {formatList, useLang, useT} from '../../../i18n';
import {href} from '../../../shell/route';
import {DaeCode} from '../../../ui/DaeCode';
import {
  ActionBar,
  Badge,
  Button,
  buttonClass,
  Check,
  cx,
  Disclosure,
  Empty,
  ErrorMessage,
  InlineAlert,
  Light,
  Link,
  Loading,
  MenuButton,
  MenuChoice,
  ModalDialog,
  Segmented,
  Tag,
  Tags,
  TextField,
  TextTooltip
} from '../../../ui/ui';
import Close from '../../../ui/icons/Close';
import DragHandle from '../../../ui/icons/DragHandle';
import type {GroupSummary} from '../../../api/model';
import type {MainSourceEdit} from '../../../store/mainSource';
import {groupPolicyText} from '../../shared/policyText';
import {newGroupPolicies} from '../../../dae/vocab';
import {PolicyPicker} from '../../shared/PolicyPicker';
import {holds, parsePlaceable, type ArrangeGroup, type Placeable} from './view';
import {PLACEABLE, useArrange} from './useArrange';

type Model = ReturnType<typeof useArrange>;
type Source = Pick<MainSourceEdit, 'main' | 'writable' | 'busy' | 'apply' | 'error'>;

export function Arrange({source, groups}: {source: Source; groups: GroupSummary[] | undefined}) {
  const t = useT();
  const m = useArrange(source);
  // The live summary of each group, for the same header the Groups tab shows.
  const live = useMemo(() => new Map((groups ?? []).map(group => [group.name, group])), [groups]);
  if (m.error) return <ErrorMessage error={m.error} onRetry={m.retry} />;
  if (m.loading) return <Loading />;
  return (
    <div className="rp-arrange">
      <div className="rp-row">
        <p className="rp-note rp-grow">{t('arrange.note')}</p>
        <NewGroup m={m} />
      </div>
      {m.blocked && <InlineAlert tone="informative">{m.blocked}</InlineAlert>}
      <div className="rp-arrange-grid">
        <div className="rp-col">
          {m.groups.length ? (
            m.groups.map(group => <GroupCard key={group.name} group={group} live={live.get(group.name)} m={m} />)
          ) : (
            <Empty>{t('policy.empty')}</Empty>
          )}
        </div>
        <Tray m={m} />
      </div>
      {m.changes.length > 0 && (
        <ActionBar label={t('arrange.pendingRegion')} message={m.pendingText}>
          <Button quiet onPress={m.discard} isDisabled={m.busy}>
            {t('arrange.discard')}
          </Button>
          <Button accent onPress={() => m.setReviewing(true)}>
            {t('arrange.review')}
          </Button>
        </ActionBar>
      )}
      <Review m={m} />
    </div>
  );
}

// A group as the Groups tab heads it, with its members as tags: exact members carry a remove action, staged
// removals an undo, and rule members are described by the rule and what it selects.
function GroupCard({group, live, m}: {group: ArrangeGroup; live: GroupSummary | undefined; m: Model}) {
  const t = useT();
  const lang = useLang();
  const heading = useId();
  const locked = !!m.blocked;
  const policy = live ? groupPolicyText(live.policy, t) : null;
  const accept = async (items: DropItem[]) => {
    const texts = await Promise.all(
      items
        .filter(isTextDropItem)
        .filter(item => item.types.has(PLACEABLE))
        .map(item => item.getText(PLACEABLE))
    );
    m.place(
      group.name,
      texts.flatMap(text => parsePlaceable(text) ?? [])
    );
  };
  const remove = (label: string, item: Placeable, blocked: string | null) => (
    <Button
      quiet
      icon
      small
      label={t('arrange.remove', {name: label, group: group.name})}
      tip={blocked ?? undefined}
      isDisabled={locked || m.applying || !!blocked}
      onPress={() => m.unplace(group.name, item)}
    >
      <Close />
    </Button>
  );
  const undo = (label: string, item: Placeable) => (
    <Button quiet small label={t('arrange.undoRemove', {name: label})} isDisabled={m.applying} onPress={() => m.place(group.name, [item])}>
      {t('arrange.undoShort')}
    </Button>
  );
  return (
    <DropZone
      className="rp-card rp-drop"
      aria-label={t('arrange.dropInto', {group: group.name})}
      isDisabled={locked || m.applying}
      getDropOperation={types => (types.has(PLACEABLE) ? 'copy' : 'cancel')}
      onDrop={event => void accept(event.items)}
    >
      {({isDropTarget}) => (
        <>
          <div className="rp-row">
            <span className="rp-cluster">
              <h3 className="rp-h3" id={heading}>
                {group.name}
              </h3>
              {policy && <Badge tip={policy.id}>{policy.label}</Badge>}
              {live && (
                <Light small tone="neutral">
                  {t('arrange.memberCount', {n: live.member_count})}
                </Light>
              )}
              {group.isNew && <Badge>{t('arrange.new')}</Badge>}
            </span>
          </div>
          {group.holdsAll && <p className="rp-note">{t('arrange.holdsAll')}</p>}
          {(group.names.length > 0 || group.removedNames.length > 0) && (
            <Tags label={t('arrange.byName')}>
              <span className="rp-label rp-tags-title">{t('arrange.byName')}</span>
              {group.names.map(item => (
                <Tag key={item.name} tone={item.isNew ? 'new' : undefined} action={remove(item.name, {kind: 'node', value: item.name}, item.blocked)}>
                  {item.name}
                </Tag>
              ))}
              {group.removedNames.map(name => (
                <Tag key={name} tone="removed" action={undo(name, {kind: 'node', value: name})}>
                  {name}
                </Tag>
              ))}
            </Tags>
          )}
          {(group.subscriptions.length > 0 || group.removedSubscriptions.length > 0) && (
            <Tags label={t('arrange.bySubscription')}>
              <span className="rp-label rp-tags-title">{t('arrange.bySubscription')}</span>
              {group.subscriptions.map(item => (
                <Tag key={item.tag} tone={item.isNew ? 'new' : undefined} action={remove(item.label, {kind: 'subscription', value: item.tag}, item.blocked)}>
                  {item.count === null ? item.label : t('arrange.subscriptionCount', {name: item.label, n: item.count})}
                </Tag>
              ))}
              {group.removedSubscriptions.map(item => (
                <Tag key={item.tag} tone="removed" action={undo(item.label, {kind: 'subscription', value: item.tag})}>
                  {item.label}
                </Tag>
              ))}
            </Tags>
          )}
          {group.rules.length > 0 && (
            <div className="rp-arrange-rules">
              <span className="rp-label">{t('arrange.byRule')}</span>
              {group.rules.map(rule => (
                <DaeCode key={rule} as="code" text={rule} />
              ))}
              {group.ruleNodes.length > 0 && (
                <span>
                  {group.ruleMore
                    ? t('arrange.ruleSelectsMore', {names: formatList(lang, group.ruleNodes), n: group.ruleMore})
                    : t('arrange.ruleSelects', {names: formatList(lang, group.ruleNodes)})}
                </span>
              )}
              <span className="rp-label">
                {group.ruleNote}{' '}
                <Link appearance="link" href={href('config', {tab: 'source'})}>
                  {t('arrange.editSource')}
                </Link>
              </span>
            </div>
          )}
          {group.stillIn.length > 0 && <InlineAlert tone="informative">{t('arrange.stillIn', {names: formatList(lang, group.stillIn)})}</InlineAlert>}
          {isDropTarget && (
            <div className="rp-drop-hint" aria-hidden="true">
              {t('arrange.dropHint')}
            </div>
          )}
        </>
      )}
    </DropZone>
  );
}

type Row = {id: string; item: Placeable; label: string; meta: string};

// Everything that can be placed, as a virtualised list with react-aria's drag and drop (pointer, keyboard and
// screen reader): drag rows onto a group card, or tick rows and add them from the bar below.
function Tray({m}: {m: Model}) {
  const t = useT();
  const heading = useId();
  const locked = !!m.blocked || m.applying;
  const [show, setShow] = useState<'all' | 'subscription' | 'node'>('all');
  const [selected, setSelected] = useState<Selection>(new Set());
  const rows = useMemo<Row[]>(
    () => [
      ...(show === 'node'
        ? []
        : m.subscriptions.map(item => ({
            id: 'subscription:' + item.tag,
            item: {kind: 'subscription' as const, value: item.tag},
            label: item.label,
            meta: t('arrange.subscriptionMeta', {n: item.count})
          }))),
      ...(show === 'subscription'
        ? []
        : m.nodes.map(node => ({id: 'node:' + node.name, item: {kind: 'node' as const, value: node.name}, label: node.name, meta: node.protocol ?? ''})))
    ],
    [show, m.subscriptions, m.nodes, t]
  );
  const byId = useMemo(() => new Map(rows.map(row => [row.id, row])), [rows]);
  const chosen = selected === 'all' ? rows : [...selected].flatMap(id => byId.get(String(id)) ?? []);
  const {dragAndDropHooks} = useDragAndDrop({
    getItems: ids =>
      [...ids].flatMap(id =>
        byId.has(String(id)) ? [{[PLACEABLE]: JSON.stringify(byId.get(String(id))!.item), 'text/plain': byId.get(String(id))!.label}] : []
      ),
    getAllowedDropOperations: () => ['copy'],
    isDisabled: locked
  });
  // A group that already holds every chosen item is not offered.
  const targets = m.groups.filter(group => chosen.some(row => !holds(group, row.item)));
  return (
    <div className="rp-card rp-tray">
      <h3 className="rp-h3" id={heading}>
        {t('arrange.tray')}
      </h3>
      <TextField search label={t('arrange.search')} value={m.search} onChange={m.setSearch} />
      <Segmented
        label={t('arrange.show')}
        value={show}
        onChange={value => setShow(value as typeof show)}
        items={[
          ['all', t('ui.all')],
          ['subscription', t('arrange.subscriptions')],
          ['node', t('arrange.nodes')]
        ]}
      />
      <Virtualizer layout={ListLayout} layoutOptions={{rowHeight: 48}}>
        <GridList
          aria-labelledby={heading}
          className="rp-tray-list"
          items={rows}
          selectionMode="multiple"
          selectionBehavior="toggle"
          selectedKeys={selected}
          onSelectionChange={setSelected}
          dragAndDropHooks={dragAndDropHooks}
          renderEmptyState={() => <Empty>{t('arrange.trayEmpty')}</Empty>}
        >
          {row => (
            <GridListItem id={row.id} textValue={row.label} className="rp-item rp-tray-row">
              {/* First in the row, as in S2's ListView: the keyboard's way into drag and drop, since Space and Enter
                  already toggle the row's selection. */}
              <RButton
                slot="drag"
                className={cx(buttonClass({quiet: true, icon: true, small: true}), 'rp-drag')}
                aria-label={t('arrange.drag', {name: row.label})}
              >
                <DragHandle />
              </RButton>
              <Check />
              <span className="rp-grow">
                <TextTooltip>{row.label}</TextTooltip>
                <span className="desc">{row.meta}</span>
              </span>
            </GridListItem>
          )}
        </GridList>
      </Virtualizer>
      <div className="rp-tray-bar">
        <span className="rp-grow rp-label" aria-live="polite">
          {chosen.length ? t('arrange.selected', {n: chosen.length}) : t('arrange.selectHint')}
        </span>
        {chosen.length > 0 && (
          <Button quiet small onPress={() => setSelected(new Set())}>
            {t('arrange.clear')}
          </Button>
        )}
        <MenuButton
          label={t('arrange.addSelected')}
          isDisabled={locked || !targets.length}
          content={
            <Menu
              aria-label={t('arrange.addSelected')}
              onAction={group => {
                m.place(
                  String(group),
                  chosen.map(row => row.item)
                );
                setSelected(new Set());
              }}
            >
              {targets.map(group => (
                <MenuChoice key={group.name} item={{id: group.name, label: group.name}} />
              ))}
            </Menu>
          }
        >
          {t('arrange.addSelected')}
        </MenuButton>
      </div>
    </div>
  );
}

function NewGroup({m}: {m: Model}) {
  const t = useT();
  const form = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [policy, setPolicy] = useState(newGroupPolicies[0].id);
  const [tried, setTried] = useState(false);
  const problem = m.nameProblem(name.trim());
  const reset = () => {
    setName('');
    setPolicy(newGroupPolicies[0].id);
    setTried(false);
  };
  return (
    <>
      <Button small onPress={() => setOpen(true)} isDisabled={!!m.blocked || m.applying}>
        {t('arrange.newGroup')}
      </Button>
      <ModalDialog
        title={t('arrange.newGroup')}
        narrow
        isOpen={open}
        onOpenChange={value => {
          setOpen(value);
          if (!value) reset();
        }}
        footer={close => (
          <>
            <Button onPress={close}>{t('ui.cancel')}</Button>
            <Button accent type="submit" form={form}>
              {t('arrange.create')}
            </Button>
          </>
        )}
      >
        <form
          id={form}
          className="rp-form"
          onSubmit={event => {
            event.preventDefault();
            setTried(true);
            if (problem) return;
            m.create(name.trim(), policy);
            setOpen(false);
            reset();
          }}
        >
          <TextField
            label={t('arrange.groupName')}
            value={name}
            onChange={setName}
            description={t('arrange.groupNameHint')}
            error={tried && problem ? problem : undefined}
            spellCheck={false}
          />
          <PolicyPicker value={policy} onChange={setPolicy} />
          <p className="rp-label">{t('arrange.newGroupNote')}</p>
        </form>
      </ModalDialog>
    </>
  );
}

// Every staged change in words, warnings the text alone would hide, and the group text as it will be written.
function Review({m}: {m: Model}) {
  const t = useT();
  const lang = useLang();
  return (
    <ModalDialog
      title={t('arrange.reviewTitle')}
      isOpen={m.reviewing}
      onOpenChange={m.setReviewing}
      footer={close => (
        <>
          <Button onPress={close} isDisabled={m.applying}>
            {t('ui.cancel')}
          </Button>
          <Button accent isPending={m.applying} isDisabled={!m.canApply} onPress={() => void m.apply()}>
            {t('arrange.apply')}
          </Button>
        </>
      )}
    >
      {m.failure && <InlineAlert takeFocus>{m.failure}</InlineAlert>}
      {m.applyNote && <InlineAlert>{m.applyNote}</InlineAlert>}
      {m.unknown.size > 0 && <InlineAlert tone="informative">{t('arrange.unknown', {names: formatList(lang, [...m.unknown])})}</InlineAlert>}
      <ol className="rp-arrange-changes">
        {m.changeLines.map((line, index) => (
          <li key={index} className="rp-row">
            <span className="rp-grow">{line}</span>
            <Button quiet icon small label={t('arrange.undo', {change: line})} isDisabled={m.applying} onPress={() => m.drop(index)}>
              <Close />
            </Button>
          </li>
        ))}
      </ol>
      <Disclosure title={t('arrange.showText')}>
        {m.preview.map(item => (
          <DaeCode key={item.group} as="pre" className="rp-arrange-preview" text={item.text} />
        ))}
      </Disclosure>
      <p className="rp-label">{t('arrange.applyNote')}</p>
    </ModalDialog>
  );
}
