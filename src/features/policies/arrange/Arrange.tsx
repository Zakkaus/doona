import {useId, useState} from 'react';
import {Menu, MenuItem} from 'react-aria-components';
import {formatList, useLang, useT} from '../../../i18n';
import {buildHash} from '../../../shell/route';
import {Badge, Button, Disclosure, Empty, InlineAlert, LabeledSelect, Link, MenuButton, ModalDialog, TextField, cx} from '../../../ui/ui';
import Close from '../../../ui/icons/Close';
import DragHandle from '../../../ui/icons/DragHandle';
import type {Node} from '../../../api/model';
import type {MainSourceEdit} from '../../config/mainSource';
import {newGroupPolicies, type ArrangeGroup} from './view';
import {PLACEABLE, useArrange, type Placeable} from './useArrange';

type Model = ReturnType<typeof useArrange>;

export function Arrange({source, nodes}: {source: Pick<MainSourceEdit, 'main' | 'writable' | 'busy' | 'apply' | 'error'>; nodes: Node[] | undefined}) {
  const t = useT();
  const m = useArrange(source, nodes);
  return (
    <div className="rp-arrange">
      <p className="rp-note">{t('arrange.note')}</p>
      {m.blocked && <InlineAlert tone="informative">{m.blocked}</InlineAlert>}
      <div className="rp-arrange-grid">
        <div className="rp-col">
          {m.groups.map(group => (
            <GroupTarget key={group.name} group={group} m={m} />
          ))}
          <NewGroup m={m} />
        </div>
        <Tray m={m} />
      </div>
      {m.changes.length > 0 && (
        <div className="rp-pending" role="region" aria-label={t('arrange.pendingRegion')}>
          <span>{m.pendingText}</span>
          <div className="rp-toolbar">
            <Button quiet onPress={m.discard} isDisabled={m.busy}>
              {t('arrange.discard')}
            </Button>
            <Button accent onPress={() => m.setReviewing(true)}>
              {t('arrange.review')}
            </Button>
          </div>
        </div>
      )}
      <Review m={m} />
    </div>
  );
}

// A group card accepts dropped tray rows; each explicit member has a remove button, rule members are explained.
function GroupTarget({group, m}: {group: ArrangeGroup; m: Model}) {
  const t = useT();
  const lang = useLang();
  const locked = !!m.blocked;
  const heading = useId();
  const [over, setOver] = useState(false);
  // Native drag and drop for the pointer; the tray's Add menu is the same action for keyboards and touch screens.
  const accepts = (event: React.DragEvent) => !locked && event.dataTransfer.types.includes(PLACEABLE);
  return (
    <section
      className="rp-card rp-drop"
      aria-labelledby={heading}
      data-drop-target={over || undefined}
      onDragOver={event => {
        if (!accepts(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setOver(true);
      }}
      onDragLeave={event => {
        if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) setOver(false);
      }}
      onDrop={event => {
        setOver(false);
        if (!accepts(event)) return;
        event.preventDefault();
        m.place(group.name, JSON.parse(event.dataTransfer.getData(PLACEABLE)) as Placeable);
      }}
    >
      <div className="rp-row">
        <h3 className="rp-h3" id={heading}>
          {group.name}
        </h3>
        {group.isNew && <Badge>{t('arrange.new')}</Badge>}
      </div>
      {group.holdsAll && <p className="rp-note">{t('arrange.holdsAll')}</p>}
      {(group.names.length > 0 || group.removedNames.length > 0) && (
        <Section title={t('arrange.byName')}>
          {group.names.map(item => (
            <Member
              key={item.name}
              label={item.name}
              isNew={item.isNew}
              blocked={item.blocked}
              locked={locked}
              removeLabel={t('arrange.remove', {name: item.name, group: group.name})}
              onRemove={() => m.unplace(group.name, {kind: 'node', value: item.name})}
            />
          ))}
          {group.removedNames.map(name => (
            <Removed key={name} label={name} undoLabel={t('arrange.undoRemove', {name})} onUndo={() => m.place(group.name, {kind: 'node', value: name})} />
          ))}
        </Section>
      )}
      {(group.subscriptions.length > 0 || group.removedSubscriptions.length > 0) && (
        <Section title={t('arrange.bySubscription')}>
          {group.subscriptions.map(item => (
            <Member
              key={item.tag}
              label={item.count === null ? item.label : t('arrange.subscriptionCount', {name: item.label, n: item.count})}
              isNew={item.isNew}
              blocked={item.blocked}
              locked={locked}
              removeLabel={t('arrange.remove', {name: item.label, group: group.name})}
              onRemove={() => m.unplace(group.name, {kind: 'subscription', value: item.tag})}
            />
          ))}
          {group.removedSubscriptions.map(item => (
            <Removed
              key={item.tag}
              label={item.label}
              undoLabel={t('arrange.undoRemove', {name: item.label})}
              onUndo={() => m.place(group.name, {kind: 'subscription', value: item.tag})}
            />
          ))}
        </Section>
      )}
      {group.rules.length > 0 && (
        <Section title={t('arrange.byRule')}>
          {group.rules.map(rule => (
            <code key={rule} className="rp-code">
              {rule}
            </code>
          ))}
          {group.ruleNodes.length > 0 && (
            <span>
              {t('arrange.ruleSelects', {names: formatList(lang, group.ruleNodes)})}
              {group.ruleMore > 0 && ' ' + t('arrange.ruleMore', {n: group.ruleMore})}
            </span>
          )}
          <span className="rp-label">
            {group.ruleNote}{' '}
            <Link appearance="link" href={buildHash('config', 'tab=source')}>
              {t('arrange.editSource')}
            </Link>
          </span>
        </Section>
      )}
      {group.stillIn.length > 0 && <InlineAlert tone="informative">{t('arrange.stillIn', {names: formatList(lang, group.stillIn)})}</InlineAlert>}
      <p className="rp-drop-hint" aria-hidden="true">
        {t('arrange.dropHint')}
      </p>
    </section>
  );
}

function Section({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <div className="rp-arrange-section">
      <span className="rp-label">{title}</span>
      <div className="rp-arrange-members">{children}</div>
    </div>
  );
}

function Member({
  label,
  isNew,
  blocked,
  locked,
  removeLabel,
  onRemove
}: {
  label: string;
  isNew: boolean;
  blocked: string | null;
  locked: boolean;
  removeLabel: string;
  onRemove: () => void;
}) {
  const t = useT();
  return (
    <div className={cx('rp-arrange-member', isNew && 'new')}>
      <span className="rp-grow">{label}</span>
      {isNew && <Badge>{t('arrange.new')}</Badge>}
      <Button quiet icon small label={removeLabel} tip={blocked ?? undefined} isDisabled={locked || !!blocked} onPress={onRemove}>
        <Close />
      </Button>
    </div>
  );
}

// A staged removal, shown where it was made until it is applied or undone.
function Removed({label, undoLabel, onUndo}: {label: string; undoLabel: string; onUndo: () => void}) {
  const t = useT();
  return (
    <div className="rp-arrange-member removed">
      <span className="rp-grow">{label}</span>
      <Badge>{t('arrange.removed')}</Badge>
      <Button quiet small label={undoLabel} onPress={onUndo}>
        {t('arrange.undoShort')}
      </Button>
    </div>
  );
}

// Everything that can be placed: subscriptions as a whole, then single nodes. Each row drags by pointer, and each
// has a menu for the same action, the path for keyboards, touch screens and screen readers.
function Tray({m}: {m: Model}) {
  const t = useT();
  const locked = !!m.blocked;
  const rows = [
    ...m.subscriptions.map(item => ({
      key: 'subscription:' + item.tag,
      item: {kind: 'subscription' as const, value: item.tag},
      label: item.label,
      meta: t('arrange.subscriptionMeta', {n: item.count})
    })),
    ...m.nodes.map(node => ({key: 'node:' + node.name, item: {kind: 'node' as const, value: node.name}, label: node.name, meta: node.protocol ?? ''}))
  ];
  return (
    <aside className="rp-card rp-tray" aria-label={t('arrange.tray')}>
      <h3 className="rp-h3">{t('arrange.tray')}</h3>
      <TextField search label={t('arrange.search')} value={m.search} onChange={m.setSearch} />
      {rows.length ? (
        <ul className="rp-tray-list" aria-label={t('arrange.tray')}>
          {rows.map(row => (
            <li
              key={row.key}
              className="rp-tray-row"
              draggable={!locked}
              onDragStart={event => {
                event.dataTransfer.setData(PLACEABLE, JSON.stringify(row.item));
                event.dataTransfer.setData('text/plain', row.label);
                event.dataTransfer.effectAllowed = 'copy';
              }}
            >
              {!locked && <DragHandle className="rp-drag" />}
              <span className="rp-grow">
                <span className="rp-tray-label">{row.label}</span>
                <span className="rp-label">{row.meta}</span>
              </span>
              <MenuButton
                quiet
                label={t('arrange.addTo', {name: row.label})}
                isDisabled={locked || !m.groups.length}
                content={
                  <Menu aria-label={t('arrange.addTo', {name: row.label})} onAction={group => m.place(String(group), row.item)}>
                    {m.groups.map(group => (
                      <MenuItem key={group.name} id={group.name} className="rp-item" textValue={group.name}>
                        {group.name}
                      </MenuItem>
                    ))}
                  </Menu>
                }
              >
                {t('arrange.add')}
              </MenuButton>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{t('arrange.trayEmpty')}</Empty>
      )}
    </aside>
  );
}

function NewGroup({m}: {m: Model}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [policy, setPolicy] = useState(newGroupPolicies[0].id);
  const [tried, setTried] = useState(false);
  const problem = m.nameProblem(name.trim());
  return (
    <>
      <Button onPress={() => setOpen(true)} isDisabled={!!m.blocked}>
        {t('arrange.newGroup')}
      </Button>
      <ModalDialog
        title={t('arrange.newGroup')}
        narrow
        isOpen={open}
        onOpenChange={value => {
          setOpen(value);
          if (!value) {
            setName('');
            setTried(false);
          }
        }}
        footer={close => (
          <>
            <Button onPress={close}>{t('ui.cancel')}</Button>
            <Button
              accent
              onPress={() => {
                setTried(true);
                if (problem) return;
                m.create(name.trim(), policy);
                close();
              }}
            >
              {t('arrange.create')}
            </Button>
          </>
        )}
      >
        <TextField
          label={t('arrange.groupName')}
          value={name}
          onChange={setName}
          description={t('arrange.groupNameHint')}
          error={tried && problem ? problem : undefined}
          spellCheck={false}
        />
        <LabeledSelect
          label={t('arrange.policy')}
          value={policy}
          onChange={setPolicy}
          items={newGroupPolicies.map(item => ({id: item.id, label: t(item.label), desc: t(item.description)}))}
        />
        <p className="rp-note">{t('arrange.newGroupNote')}</p>
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
          <Button onPress={close}>{t('ui.cancel')}</Button>
          <Button accent isPending={m.busy} isDisabled={!m.canApply} onPress={() => void m.apply()}>
            {t('arrange.apply')}
          </Button>
        </>
      )}
    >
      {m.applyNote && <InlineAlert>{m.applyNote}</InlineAlert>}
      {m.unknown.size > 0 && <InlineAlert tone="informative">{t('arrange.unknown', {names: formatList(lang, [...m.unknown])})}</InlineAlert>}
      <ol className="rp-arrange-changes">
        {m.changeLines.map((line, index) => (
          <li key={index} className="rp-row">
            <span className="rp-grow">{line}</span>
            <Button quiet icon small label={t('arrange.undo', {change: line})} onPress={() => m.drop(index)}>
              <Close />
            </Button>
          </li>
        ))}
      </ol>
      <Disclosure title={t('arrange.showText')}>
        {m.preview.map(item => (
          <pre key={item.group} className="rp-code rp-arrange-preview">
            {item.text}
          </pre>
        ))}
      </Disclosure>
      <p className="rp-note">{t('arrange.applyNote')}</p>
    </ModalDialog>
  );
}
