import {expect, it, vi} from 'vitest';
import {createMockApi} from '../index';
import {writeTemplate} from '../../../dae/setup';
import {defaultTemplateOptions, detectTemplate, templateRules, templates} from '../../../dae/templates';
import {groupAdmits, nestedIn, readGroupEntries} from '../../../dae/groups';
import {scanConfig} from '../../../dae/text';
import {configMain} from './configuration';

it('seeds the regions template with its default routing and groups beside explicit custom examples', async () => {
  const template = writeTemplate('', 'regions', [], {t: key => key});
  const expected = readGroupEntries(template);
  const actual = readGroupEntries(configMain);
  expect(detectTemplate(configMain)).toEqual({template: 'regions', group: null, ...defaultTemplateOptions});
  expect(actual.map(entry => entry.name)).toEqual([...templates.regions.groups.map(group => group.name), 'gaming', 'office', 'backup']);
  const fields = (entry: (typeof actual)[number]) => ({name: entry.name, filters: entry.filters, policy: entry.policy, default: entry.default});
  expect(actual.slice(0, expected.length).map(fields)).toEqual(expected.map(fields));
  const api = createMockApi();
  expect((await api.rules()).rules.map(rule => [rule.expression, rule.outbound])).toEqual([
    ...templateRules('regions')
      .filter(line => !line.startsWith('#'))
      .map(line => line.split(' -> ')),
    ['fallback: proxy', 'proxy']
  ]);
  const nodes = (await api.nodes({limit: 1000})).nodes;
  for (const entry of actual) {
    const group = await api.group(entry.name);
    expect(group.policy.native).toBe(entry.policy);
    expect(group.members.map(member => member.id)).toEqual([
      ...nestedIn(entry),
      ...nodes.filter(node => groupAdmits(entry.filters, node)).map(node => node.id)
    ]);
    expect(group.config.default_member_id).toBe(entry.default?.replaceAll("'", '') ?? null);
  }
  expect((await api.group('gaming')).members.map(member => member.id)).toEqual(['hk-02', 'jp-01']);
  expect((await api.group('backup')).members).toHaveLength(120);
  expect((await api.group('office')).policy.native).toBe('fixed(0)');
  expect(scanConfig(configMain).blocks.filter(block => block.name === 'group')).toHaveLength(1);
});

it('preserves template memberships and nested defaults across a reload', async () => {
  vi.useFakeTimers();
  try {
    const api = createMockApi();
    const before = await Promise.all((await api.groups()).map(group => api.group(group.id)));
    const accepted = await api.startReload();
    await vi.advanceTimersByTimeAsync(1000);
    expect((await api.operation(accepted.operation_id)).status).toBe('succeeded');
    const after = await Promise.all((await api.groups()).map(group => api.group(group.id)));
    expect(after.map(group => [group.id, group.members, group.policy, group.config.default_member_id])).toEqual(
      before.map(group => [group.id, group.members, group.policy, group.config.default_member_id])
    );
    expect((await api.group('bahamut')).runtime.selection.tcp).toMatchObject({member_id: 'tw', resolved_leaf_node_id: expect.any(String)});
  } finally {
    vi.useRealTimers();
  }
});
