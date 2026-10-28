import type {ConfigSource, Provider} from '../../../src/api/model';
import {groupsNamingTag} from '../../../src/dae/groups';
import {completeSubscriptionUrl, readSubscriptionEntries, writeSubscriptionEntry} from '../../../src/dae/subscriptions';
import {quote} from '../../../src/dae/text';
import {LiteError, refreshProvider, type Connection} from './api';
import {appendEntry, removeEntry} from './config';
import type {Notice} from './state';

type SubscriptionEdit = {kind: 'add' | 'edit' | 'delete'; name: string; url: string; interval?: number | null};
type Draft = {content: string; stage: (content: string, key: string, summary: string) => void};

// Every subscription change joins the page draft; only the draft's review step writes.
export async function stageSubscription(connection: Connection, source: ConfigSource, draft: Draft, edit: SubscriptionEdit, summary: string) {
  const {kind, name} = edit;
  const current = await connection.api.config();
  if (
    kind !== 'add' &&
    readSubscriptionEntries(source.content).some(entry => entry.tag === name) &&
    current.sources.flatMap(item => readSubscriptionEntries(item.content)).filter(entry => entry.tag === name).length !== 1
  )
    throw new LiteError('incomplete');
  let content = draft.content;
  if (kind === 'add') {
    content = appendEntry(content, 'subscription', `${quote(name)}: ${quote(completeSubscriptionUrl(edit.url))}`);
    if (edit.interval !== undefined) content = writeSubscriptionEntry(content, name, {interval: edit.interval});
  } else if (kind === 'edit')
    content = writeSubscriptionEntry(content, name, {
      url: completeSubscriptionUrl(edit.url),
      ...(edit.interval !== undefined ? {interval: edit.interval} : {})
    });
  else {
    const entry = readSubscriptionEntries(content).find(item => item.tag === name);
    if (!entry) throw new LiteError('conflict');
    // Refuse removal while any source, the staged one included, still names this subscription.
    if (current.sources.some(item => groupsNamingTag(item.id === source.id ? content : item.content, name).length)) throw new LiteError('referenced');
    content = removeEntry(content, entry);
  }
  draft.stage(content, `subscription:${name}`, summary);
}

// The write already stands, so a failed first fetch of a new subscription is a warning, not an error.
export async function refreshAdded(connection: Connection, before: Provider[], after: Provider[]): Promise<Notice | undefined> {
  const known = new Set(before.map(provider => provider.id));
  let failed = false;
  for (const provider of after.filter(item => item.kind === 'subscription' && !known.has(item.id))) {
    try {
      if ('degraded' in (await refreshProvider(connection.api, provider.id))) failed = true;
    } catch {
      failed = true;
    }
  }
  return failed ? {key: 'refreshPartial'} : undefined;
}
