import {expect, it} from 'vitest';
import {createMockApi} from '../../api/mock';
import {memberHealth} from './health';

it('prefers group TCP data observations by warmth, measurement and IP version before falling back to node health', async () => {
  const group = await createMockApi().group('proxy');
  const base = group.runtime.health[0];
  group.members = ['ranked', 'fallback', 'untested', 'nested'].map(id => ({...group.members[0], id, name: id, kind: id === 'nested' ? 'group' : 'node'}));
  const warm = {...base, member_id: 'ranked', transport: 'tcp' as const, purpose: 'data' as const, warmth: 'warm' as const};
  const best = {...warm, measurement: 'tcp_connect' as const, ip_version: 'ipv4' as const, state: 'unavailable' as const, latency_ms: null};
  const nested = {...best, member_id: 'nested'};
  const fallback = {...best, state: 'healthy' as const, latency_ms: 10};
  group.runtime.health = [
    {...best, warmth: 'cold'},
    {...warm, measurement: 'http_headers'},
    {...best, ip_version: 'ipv6'},
    best,
    {...best, state: 'healthy', latency_ms: 1},
    {...best, member_id: 'fallback', transport: 'udp'},
    {...best, member_id: 'untested', purpose: 'dns'},
    nested
  ];
  const original = structuredClone(group);
  expect(
    memberHealth(
      group,
      new Map([
        ['ranked', fallback],
        ['fallback', fallback]
      ])
    )
  ).toEqual([
    {...group.members[0], health: best},
    {...group.members[1], health: fallback},
    {...group.members[2], health: undefined},
    {...group.members[3], health: nested}
  ]);
  expect(group).toEqual(original);
  expect(memberHealth(undefined, new Map())).toEqual([]);
});
