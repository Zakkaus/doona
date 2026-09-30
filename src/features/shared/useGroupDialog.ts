import {useRef, useState} from 'react';
import {useT} from '../../i18n';
import {nameText, readGroupEntries, writeGroupEntry, type GroupEntryUpdate} from '../../dae/groups';
import {unquote} from '../../dae/text';
import {editProblem, type MainSourceEdit} from '../../store/mainSource';
import type {ConfigSource, Group} from '../../api/model';
import {toast} from '../../ui/ui';
import {useDialogSession, useDraftGuard} from '../../shell/draft';
import {LocalError, noticeText} from '../../api/error';
import {groupEditSafe, groupNameError} from './policyText';
import {newGroupPolicies} from '../../dae/vocab';
import type {SearchSection} from '../../ui/SearchSelect';
import {
  editBlocked,
  finalSections,
  finalExcluded,
  groupConfigLabels,
  memberSections,
  routeChoiceId,
  routeChoiceValue,
  routeFields,
  routeValue,
  routeWritable,
  type GroupOwner,
  type OutboundCatalogue,
  type RouteField
} from './groupText';
export type GroupDialogView = {
  title: string;
  name: {value: string; error: string | null; change: (value: string) => void} | null;
  help: string;
  submitLabel: string;
  open: boolean;
  // Open on the file's declaration; false while the dialog only shows the group's configuration.
  editing: boolean;
  // Whether the dialog can open on the declaration; when it cannot, it opens read-only (`view`).
  editable: boolean;
  disabled: boolean;
  // Why the declaration cannot be edited.
  tip?: string;
  busy: boolean;
  // Why the last save did not land; `id` changes with each refusal so the alert takes focus again.
  problem: {id: number; text: string} | null;
  policy: string | null;
  filters: Array<{id: number; value: string; label: string; removeLabel: string; change: (value: string) => void; remove: () => void}>;
  // The default member and final outbound pickers under the filters, each only when the group offers it.
  routes: Array<{
    id: RouteField;
    label: string;
    description: string;
    searchLabel: string;
    value: string;
    sections: SearchSection[];
    change: (id: string) => void;
  }>;
  show: (filters?: string[]) => void;
  // Opens the dialog read-only, on the group's configuration alone.
  view: () => void;
  close: () => void;
  setPolicy: (value: string) => void;
  add: () => void;
  save: (close: () => void) => void;
  interrupt: boolean | null | undefined;
  setInterrupt: (value: boolean) => void;
};
// Where the group is declared, and whether that source's text is complete and the configuration read.
export type PolicyDeclaration = {owner: GroupOwner | undefined; complete: boolean | undefined; loaded: boolean; error: Error | null};
// What the default member and final outbound pickers offer: the live group, its members as their tiles show them,
// and every outbound a final can name.
export type RouteContext = {g: Group | undefined; members: Parameters<typeof memberSections>[0]; outbounds: OutboundCatalogue};
const routeHelp = {default_member_id: 'policy.defaultMemberHelp', final_outbound: 'policy.finalOutboundHelp'} as const;
// The file's key for each field, as the draft holds it.
const routeKeys = {default_member_id: 'default', final_outbound: 'final'} as const;
// `origin` is the source the dialog opened on, so a change on disk refuses the first save; once refused, a save goes against the source as it is
// declared then, since the sources are read again after a refusal.
type Draft = {
  name: string;
  origin: ConfigSource | null;
  refused: boolean;
  policy: string | null;
  filters: string[];
  default: string | null;
  final: string | null;
  interrupt: string | null;
};
type Input =
  | {mode: 'edit'; name: string; source: MainSourceEdit; declaration: PolicyDeclaration; context: RouteContext}
  | {
      mode: 'create';
      source: Pick<MainSourceEdit, 'main' | 'writable' | 'busy' | 'apply'>;
      taken: ReadonlySet<string>;
      outbounds: OutboundCatalogue;
      stage?: (name: string, entry: GroupEntryUpdate) => void;
      onCreated?: (name: string) => void;
    };
export function useGroupDialog(input: Input): GroupDialogView {
  const t = useT();
  const {source} = input;
  const creating = input.mode === 'create';
  const name = creating ? '' : input.name;
  const declaration = creating ? null : input.declaration;
  const context = creating ? {g: undefined, members: [], outbounds: input.outbounds} : input.context;
  const owner = declaration?.owner;
  const declared = owner === 'ambiguous' ? undefined : owner;
  const entry = declared?.entry;
  const blocked = declaration ? editBlocked(owner, declaration, t) : null;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [viewing, setViewing] = useState(false);
  const busy = source.busy;
  const routes: RouteField[] = creating ? ['final_outbound'] : routeFields(context.g, draft?.policy ?? null);
  const groupName = creating ? (draft?.name.trim() ?? '') : (draft?.name ?? '');
  const excluded = finalExcluded(groupName, context.outbounds.links);
  const [tried, setTried] = useState(false);
  const saving = useRef(false);
  const nameProblem = creating && draft ? groupNameError(draft.name.trim(), input.taken, t) : null;
  const session = useDialogSession();
  const [problem, setProblem] = useState<GroupDialogView['problem']>(null);
  const refuse = (text: string) => setProblem(prev => ({id: (prev?.id ?? 0) + 1, text}));
  const guard = useDraftGuard(
    !!draft &&
      ((creating && !!draft.name) ||
        (!creating && draft.interrupt !== entry?.interrupt) ||
        draft.policy !== (creating ? newGroupPolicies[0].id : entry?.policy) ||
        JSON.stringify(draft.filters) !== JSON.stringify(creating ? [] : entry?.filters) ||
        routes.some(id => draft[routeKeys[id]] !== routeValue(entry?.[routeKeys[id]] ?? null))),
    () => {
      session.next();
      setDraft(null);
      setProblem(null);
    }
  );
  const save = (close: () => void) => {
    if (!draft || source.busy || saving.current) return;
    setTried(true);
    if (nameProblem) return;
    const filters = draft.filters.map(f => f.trim()).filter(Boolean);
    const written = {default: entry?.default ?? null, final: entry?.final ?? null};
    if (
      !groupEditSafe(filters, draft.policy, entry) ||
      !routes.every(id => routeWritable(draft[routeKeys[id]], written[routeKeys[id]])) ||
      (creating && draft.final !== null && excluded.has(draft.final))
    ) {
      refuse(t('policy.editUnsafe'));
      return;
    }
    const group = creating ? draft.name.trim() : draft.name;
    const update: GroupEntryUpdate = {filters, policy: draft.policy, ...(!creating ? {interrupt: draft.interrupt} : {})};
    for (const id of routes) Object.assign(update, {[routeKeys[id]]: nameText(draft[routeKeys[id]], written[routeKeys[id]])});
    if (creating && input.stage) {
      input.stage(group, update);
      guard.clear();
      close();
      return;
    }
    saving.current = true;
    const current = session.start();
    const origin = draft.refused ? (creating ? source.main : declared?.origin) : draft.origin;
    void source
      .apply(text => {
        if (creating && readGroupEntries(text).some(entry => entry.name === group)) throw new LocalError('arrange.takenName');
        return writeGroupEntry(text, group, update);
      }, origin ?? undefined)
      .then(result => {
        const open = current();
        if (result.kind === 'ok') {
          if (open) {
            guard.clear();
            close();
          }
          if (creating && input.onCreated) input.onCreated(group);
          else toast('positive', t('policy.updated', {name: group}));
        }
        const problem = editProblem(result, t);
        // A refusal after the dialog closed has nowhere inline to go.
        if (problem) {
          if (open) {
            refuse(noticeText(problem, t));
            setDraft(prev => (prev ? {...prev, refused: true} : prev));
          } else toast(problem.kind, problem.text, {detail: problem.detail, requestId: problem.requestId});
        }
      })
      .finally(() => {
        saving.current = false;
      });
  };
  // Edits wait while a save is in flight; what was submitted is what the outcome describes.
  const edit = (update: (prev: NonNullable<typeof draft>) => NonNullable<typeof draft>) => {
    if (!source.busy && !saving.current) setDraft(prev => (prev ? update(prev) : prev));
  };
  return {
    title: creating ? t('arrange.newGroup') : t(draft ? 'policy.editTitle' : 'policy.viewTitle', {name}),
    name:
      creating && draft
        ? {value: draft.name, error: tried || draft.name.trim() ? nameProblem : null, change: value => edit(prev => ({...prev, name: value}))}
        : null,
    help: creating ? '' : t('policy.editHelp'),
    submitLabel: t(creating ? 'arrange.create' : 'policy.save'),
    open: !!draft || viewing,
    editing: !!draft,
    editable: !!draft || (source.writable && blocked === null),
    disabled: busy,
    tip: source.writable ? (blocked ?? undefined) : t('arrange.readOnly'),
    busy,
    problem,
    policy: draft?.policy ?? null,
    filters: (draft?.filters ?? []).map((value, id) => ({
      id,
      value,
      label: t('policy.filterN', {n: id + 1}),
      removeLabel: t('policy.removeFilter', {n: id + 1}),
      change: (value: string) => edit(prev => ({...prev, filters: prev.filters.map((f, i) => (i === id ? value : f))})),
      remove: () => edit(prev => ({...prev, filters: prev.filters.filter((_, i) => i !== id)}))
    })),
    routes: draft
      ? routes.map(id => {
          const key = routeKeys[id];
          const held = [routeValue(entry?.[key] ?? null), draft[key]];
          return {
            id,
            label: t(groupConfigLabels[id]),
            description: t(routeHelp[id]),
            searchLabel: t(id === 'default_member_id' ? 'ui.filterMembers' : 'ui.filterOutbounds'),
            value: routeChoiceId(draft[key]),
            sections:
              id === 'default_member_id'
                ? memberSections(context.members, held, t)
                : finalSections(groupName, context.outbounds, held, t)
                    .map(section => (creating ? {...section, items: section.items.filter(item => !excluded.has(routeChoiceValue(item.id) ?? ''))} : section))
                    .filter(section => section.items.length),
            change: (choice: string) => edit(prev => ({...prev, [key]: routeChoiceValue(choice)}))
          };
        })
      : [],
    show: (filters = []) => {
      session.next();
      setProblem(null);
      setTried(false);
      if (creating) setDraft({name: '', origin: source.main, refused: false, policy: newGroupPolicies[0].id, filters, default: null, final: null, interrupt: null});
      else if (declared && !blocked)
        setDraft({
          name: declared.entry.name,
          origin: declared.origin,
          refused: false,
          policy: declared.entry.policy,
          filters: declared.entry.filters,
          default: routeValue(declared.entry.default),
          final: routeValue(declared.entry.final),
          interrupt: declared.entry.interrupt
        });
    },
    view: () => {
      session.next();
      setProblem(null);
      setViewing(true);
    },
    close: () => {
      session.next();
      setProblem(null);
      guard.clear();
      setDraft(null);
      setViewing(false);
    },
    setPolicy: policy => edit(prev => ({...prev, policy})),
    add: () => edit(prev => ({...prev, filters: [...prev.filters, '']})),
    save,
    interrupt: draft ? (draft.interrupt === null ? null : unquote(draft.interrupt) === 'true') : undefined,
    setInterrupt: value => edit(prev => ({...prev, interrupt: value ? 'true' : prev.interrupt === null ? null : 'false'}))
  };
}
