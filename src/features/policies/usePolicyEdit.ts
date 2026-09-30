import {useState} from 'react';
import {getApi} from '../../api';
import {useT} from '../../i18n';
import {nameText, writeGroupEntry} from '../../dae/groups';
import {editProblem, type MainSourceEdit} from '../../store/mainSource';
import type {ConfigSource, Group} from '../../api/model';
import {toast} from '../../ui/ui';
import {useDialogSession, useDraftGuard} from '../../shell/draft';
import {noticeText} from '../../api/error';
import {groupEditSafe} from '../shared/policyText';
import type {SearchSection} from '../../ui/SearchSelect';
import {
  editBlocked,
  finalSections,
  groupConfigLabels,
  memberSections,
  routeChoiceId,
  routeChoiceValue,
  routeFields,
  routeValue,
  routeWritable,
  type GroupOwner,
  type MemberView,
  type OutboundCatalogue,
  type RouteField
} from './view';
export type PolicyEditView = {
  title: string;
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
  show: () => void;
  // Opens the dialog read-only, on the group's configuration alone.
  view: () => void;
  close: () => void;
  setPolicy: (value: string) => void;
  add: () => void;
  save: (close: () => void) => void;
  refreshOrigin: (write: () => Promise<boolean | undefined>) => Promise<boolean | undefined>;
};
// Where the group is declared, and whether that source's text is complete and the configuration read.
export type PolicyDeclaration = {owner: GroupOwner | undefined; complete: boolean | undefined; loaded: boolean; error: Error | null};
// What the default member and final outbound pickers offer: the live group, its members as their tiles show them,
// and every outbound a final can name.
export type RouteContext = {g: Group | undefined; members: MemberView[]; outbounds: OutboundCatalogue};
const routeHelp = {default_member_id: 'policy.defaultMemberHelp', final_outbound: 'policy.finalOutboundHelp'} as const;
// The file's key for each field, as the draft holds it.
const routeKeys = {default_member_id: 'default', final_outbound: 'final'} as const;
// `origin` is the source the dialog opened on, so a change on disk refuses the first save; once refused, a save goes against the source as it is
// declared then, since the sources are read again after a refusal.
type Draft = {
  name: string;
  origin: ConfigSource;
  refused: boolean;
  policy: string | null;
  filters: string[];
  default: string | null;
  final: string | null;
};
// Edits the group in the source that declares it; `source` carries the write and whether the backend takes one.
export function usePolicyEdit(name: string, source: MainSourceEdit, declaration: PolicyDeclaration, context: RouteContext): PolicyEditView {
  const t = useT();
  const {owner} = declaration;
  const declared = owner === 'ambiguous' ? undefined : owner;
  const entry = declared?.entry;
  const blocked = editBlocked(owner, declaration, t);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [viewing, setViewing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const busy = source.busy || refreshing;
  const routes = routeFields(context.g, draft?.policy ?? null);
  const session = useDialogSession();
  const [problem, setProblem] = useState<PolicyEditView['problem']>(null);
  const refuse = (text: string) => setProblem(prev => ({id: (prev?.id ?? 0) + 1, text}));
  const guard = useDraftGuard(
    !!draft &&
      (draft.policy !== entry?.policy ||
        JSON.stringify(draft.filters) !== JSON.stringify(entry?.filters) ||
        routes.some(id => draft[routeKeys[id]] !== routeValue(entry?.[routeKeys[id]] ?? null))),
    () => {
      session.next();
      setDraft(null);
      setProblem(null);
    }
  );
  const save = (close: () => void) => {
    if (!draft || busy) return;
    const filters = draft.filters.map(f => f.trim()).filter(Boolean);
    const written = {default: entry?.default ?? null, final: entry?.final ?? null};
    if (!groupEditSafe(filters, draft.policy, entry) || !routes.every(id => routeWritable(draft[routeKeys[id]], written[routeKeys[id]]))) {
      refuse(t('policy.editUnsafe'));
      return;
    }
    const current = session.start();
    const origin = draft.refused ? (declared?.origin ?? draft.origin) : draft.origin;
    void source
      .apply(text => {
        const update = {filters, policy: draft.policy};
        // A field the dialog does not offer, such as the default member under an automatic policy, is left as the file
        // has it.
        for (const id of routes) Object.assign(update, {[routeKeys[id]]: nameText(draft[routeKeys[id]], written[routeKeys[id]])});
        return writeGroupEntry(text, draft.name, update);
      }, origin)
      .then(result => {
        const open = current();
        if (result.kind === 'ok') {
          if (open) {
            guard.clear();
            close();
          }
          toast('positive', t('policy.updated', {name: draft.name}));
        }
        const problem = editProblem(result, t);
        // A refusal after the dialog closed has nowhere inline to go.
        if (problem) {
          if (open) {
            refuse(noticeText(problem, t));
            setDraft(prev => (prev ? {...prev, refused: true} : prev));
          } else toast(problem.kind, problem.text, {detail: problem.detail, requestId: problem.requestId});
        }
      });
  };
  // Edits wait while a save is in flight; what was submitted is what the outcome describes.
  const edit = (update: (prev: NonNullable<typeof draft>) => NonNullable<typeof draft>) => {
    if (!busy) setDraft(prev => (prev ? update(prev) : prev));
  };
  return {
    title: t(draft ? 'policy.editTitle' : 'policy.viewTitle', {name}),
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
            sections: id === 'default_member_id' ? memberSections(context.members, held, t) : finalSections(draft.name, context.outbounds, held, t),
            change: (choice: string) => edit(prev => ({...prev, [key]: routeChoiceValue(choice)}))
          };
        })
      : [],
    show: () => {
      session.next();
      setProblem(null);
      if (declared && !blocked)
        setDraft({
          name: declared.entry.name,
          origin: declared.origin,
          refused: false,
          policy: declared.entry.policy,
          filters: declared.entry.filters,
          default: routeValue(declared.entry.default),
          final: routeValue(declared.entry.final)
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
    refreshOrigin: async write => {
      if (!draft) return write();
      const current = session.start();
      setRefreshing(true);
      try {
        const api = getApi();
        const before = await api.config().catch(() => null);
        const saved = await write();
        if (saved) {
          const after = await api.config().catch(() => null);
          const origin = after?.sources.find(item => item.id === draft.origin.id);
          // A pre-existing external edit still requires a refusal; only our own write advances the draft's base.
          if (current() && origin && before?.sources.find(item => item.id === draft.origin.id)?.content_sha256 === draft.origin.content_sha256)
            setDraft(prev => (prev && prev.origin === draft.origin ? {...prev, origin} : prev));
          source.retry();
        }
        return saved;
      } finally {
        setRefreshing(false);
      }
    }
  };
}
