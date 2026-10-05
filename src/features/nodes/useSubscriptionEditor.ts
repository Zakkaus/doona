import {useState} from 'react';
import {formatList, type Lang, type Translator} from '../../i18n';
import type {Capabilities, ConfigSource} from '../../api/model';
import {addSubtagsToGroup, citingGroups, removeSubtagsFromGroup} from '../../dae/groups';
import {isBareName} from '../../dae/text';
import {agentProblem, completeSubscriptionUrl, writeSubscriptionEntry, type SubscriptionChange, type SubscriptionText} from '../../dae/subscriptions';
import {draftInterval} from './subscription';
import type {SubscriptionFieldSet} from './SubscriptionFields';
import {keptOptions, providerChanges, renameReferences, subscriptionUrlError, type ProviderForm, type ProviderRow} from './view';

export type SubscriptionEdit = {kind: 'editProvider'; item: ProviderRow; source: ConfigSource; entry: SubscriptionText; focus?: 'interval'};
type CreateOptions = Capabilities['resources']['providers']['create_options'] | undefined;

// What a save writes: only the fields changed against the entry the dialog opened with, so a source rewritten
// meanwhile, by a refresh or another editor, keeps every field the person left alone.
export function subscriptionChange(entry: SubscriptionText, form: ProviderForm, defaultCache: boolean | undefined): SubscriptionChange {
  const changed = providerChanges(form, entry, defaultCache);
  const interval = draftInterval(form.interval);
  const route = form.route || 'routing';
  return {
    ...(changed.name ? {tag: form.name.trim()} : {}),
    ...(changed.url ? {url: completeSubscriptionUrl(form.value)} : {}),
    ...(changed.interval && interval != null ? {interval} : {}),
    ...(changed.agent ? {ua: form.agent.trim() || null} : {}),
    ...(changed.cache ? {cache: form.cache} : {}),
    // Following the routing rules is honk's default, so choosing it removes the route.
    ...(changed.route ? {route: route === 'routing' ? null : route} : {})
  };
}

// The edit-subscription dialog: field checks, the options it shows, the groups a rename carries along, and the write.
export function useSubscriptionEditor(input: {
  dialog: SubscriptionEdit | null;
  form: ProviderForm;
  sources: ConfigSource[];
  declared: Map<string, Array<{source: ConfigSource; entry: SubscriptionText}>>;
  groups: string[];
  createOptions: CreateOptions;
  lang: Lang;
  t: Translator;
}) {
  const {dialog, form, sources, declared, t} = input;
  // Each opened dialog starts with the groups carried along.
  const [carry, setCarry] = useState({dialog, updateGroups: true});
  const updateGroups = carry.dialog === dialog ? carry.updateGroups : true;
  if (carry.dialog !== dialog) setCarry({dialog, updateGroups: true});
  // The source is read again after a refused save, so the next save writes the entry as it is written now; null once
  // no source, or more than one, declares it.
  const editing = dialog ? declared.get(dialog.entry.tag) : undefined;
  const source = editing?.length === 1 ? editing[0].source : null;
  // The switch shows the entry's cache, or the default a new subscription gets when the entry sets none.
  const writtenCache = dialog ? (dialog.entry.cache ?? input.createOptions?.cache) : undefined;
  const change = dialog ? subscriptionChange(dialog.entry, form, input.createOptions?.cache) : {};
  // A kept name is valid as written; a new one is bare, as doona writes names, and free among the subscriptions.
  const name = form.name.trim();
  const nameError =
    !dialog || name === dialog.entry.tag || !name ? null : !isBareName(name) ? t('nodes.nameInvalid') : declared.has(name) ? t('nodes.tagTaken') : null;
  // An entry's own User-Agent must also be written back as a quoted value; empty removes it, leaving the engine default.
  const agentKey = agentProblem(form.agent, true);
  const agentError = agentKey && t(agentKey);
  const urlError = subscriptionUrlError(form.value, t);
  const urlValid = !!form.value.trim() && urlError === null;
  const references = dialog && change.tag !== undefined ? renameReferences(sources, source ?? dialog.source, dialog.entry.tag) : {here: [], elsewhere: []};
  const fields: SubscriptionFieldSet | null = dialog && {
    interval: dialog.entry.interval,
    agent: {fallback: input.createOptions?.user_agent, description: t('nodes.agentDefault')},
    cache: writtenCache,
    // An engine that fetches subscriptions only directly leaves the route out of its providers.
    routes: dialog.item.download === undefined ? undefined : input.groups
  };
  return {
    source,
    updateGroups,
    setUpdateGroups: (next: boolean) => setCarry({dialog, updateGroups: next}),
    valid:
      !!name &&
      nameError === null &&
      draftInterval(form.interval) !== null &&
      urlValid &&
      agentError === null &&
      !references.elsewhere.length &&
      Object.keys(change).length > 0,
    reason: !name ? t('nodes.nameMissing') : urlValid ? null : (urlError ?? t('nodes.urlInvalid')),
    errors: {name: name ? nameError : null, agent: agentError, url: urlError},
    fields,
    options: dialog && fields ? keptOptions(dialog.entry.options, {cache: writtenCache !== undefined, route: !!fields.routes}) : [],
    // Renaming offers to carry the groups whose subtag filter names the old tag along in the same write,
    // unless another source or an expression names it too: a write across sources is not atomic, so the rename waits.
    renameGroups: references.here.length && !references.elsewhere.length ? formatList(input.lang, references.here) : null,
    // A rename that cannot carry every filter along blocks on the groups naming the old tag.
    blockedTag: dialog && references.elsewhere.length ? dialog.entry.tag : null,
    // Filters are read from the text being written, so a group changed meanwhile is still found.
    write: (text: string) => {
      if (!dialog) return text;
      const from = dialog.entry.tag;
      const written = writeSubscriptionEntry(text, from, change);
      const tag = change.tag;
      if (tag === undefined || !updateGroups) return written;
      return citingGroups(written, from).reduce((out, group) => removeSubtagsFromGroup(addSubtagsToGroup(out, group, [tag]), group, [from]), written);
    }
  };
}
