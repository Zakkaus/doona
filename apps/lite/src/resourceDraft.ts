import {groupsNamingTag} from '../../../src/dae/groups';
import {isNodeLink, nodeReferenced, readNodeEntries, writeNodeEntry} from '../../../src/dae/nodes';
import {completeSubscriptionUrl, isSubscriptionUrl, readSubscriptionEntries, writeSubscriptionEntry} from '../../../src/dae/subscriptions';
import {isQuotable, quote} from '../../../src/dae/text';
import {LiteError} from './api';
import {appendEntry, removeEntry} from './config';
type ResourceKind = 'node' | 'subscription';
type ResourceAction = 'form' | 'text' | 'duplicate' | 'delete';
export function draftResources(content: string, kind: ResourceKind) {
  return kind === 'node'
    ? readNodeEntries(content).map(entry => ({name: entry.name, value: entry.link, from: entry.from, to: entry.to}))
    : readSubscriptionEntries(content).map(entry => ({name: entry.tag, value: entry.url, from: entry.from, to: entry.to}));
}
function resourceReferenced(contents: string[], kind: ResourceKind, name: string) {
  return contents.some(content => (kind === 'node' ? nodeReferenced(content, name) : groupsNamingTag(content, name).length > 0));
}
export function changeResource(content: string, others: string[], kind: ResourceKind, action: ResourceAction, original: string, name: string, value: string) {
  const entry = draftResources(content, kind).find(entry => entry.name === original);
  if (!entry || [content, ...others].flatMap(text => draftResources(text, kind)).filter(entry => entry.name === original).length !== 1)
    throw new LiteError('incomplete');
  if (action === 'delete') {
    if (resourceReferenced([content, ...others], kind, original)) throw new LiteError('referenced');
    return removeEntry(content, entry);
  }
  const next = name.trim();
  if (!next || !isQuotable(next) || !isQuotable(value) || !(kind === 'node' ? isNodeLink(value) : isSubscriptionUrl(value)))
    throw new LiteError('invalidField');
  if (action === 'duplicate') {
    if ([content, ...others].some(text => draftResources(text, kind).some(entry => entry.name === next))) throw new LiteError('invalidField');
    if (kind === 'node') return appendEntry(content, 'node', `${quote(next)}: ${quote(value.trim())}`);
    const copy = writeSubscriptionEntry(`subscription {\n${content.slice(entry.from, entry.to)}\n}`, original, {
      tag: next,
      url: completeSubscriptionUrl(value)
    });
    const duplicate = draftResources(copy, kind)[0];
    return appendEntry(content, 'subscription', copy.slice(duplicate.from, duplicate.to));
  }
  // Keep names fixed here; renaming a node belongs to its dedicated editor.
  if (next !== original) throw new LiteError('invalidField');
  return kind === 'node'
    ? writeNodeEntry(
        content,
        readNodeEntries(content).find(entry => entry.name === original)!,
        {name: next, link: value.trim()}
      )
    : writeSubscriptionEntry(content, original, {url: completeSubscriptionUrl(value)});
}
