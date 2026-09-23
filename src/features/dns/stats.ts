import type {DnsLogRecord} from '../../api/model';
import {percentile} from '../../ui/charts/layout';

// Mutually exclusive outcomes: a cache hit counts as that whatever its status, then uncached records by status.
export const dnsOutcomes = ['cached', 'answered', 'nxdomain', 'failed'] as const;
export type DnsOutcome = (typeof dnsOutcomes)[number];
const outcomeOf = (record: DnsLogRecord): DnsOutcome =>
  record.cached ? 'cached' : record.status === 'NOERROR' ? 'answered' : record.status === 'NXDOMAIN' ? 'nxdomain' : 'failed';

export type LatencySample = {id: string; value: number; outcome: DnsOutcome; name: string; upstream: string};
export type UpstreamLatency = {upstream: string; median: number; samples: LatencySample[]};

// What the loaded records say about speed and outcomes. Latency only counts uncached lookups that reached an
// upstream, since a cache hit or a failure before sending measures nothing about the upstream.
export function dnsAnalysis(records: DnsLogRecord[]) {
  const counts: Record<DnsOutcome, number> = {cached: 0, answered: 0, nxdomain: 0, failed: 0};
  const samples: LatencySample[] = [];
  for (const record of records) {
    const outcome = outcomeOf(record);
    counts[outcome]++;
    if (!record.cached && record.upstream !== null)
      samples.push({id: record.id, value: record.elapsed_ms, outcome, name: record.question.name, upstream: record.upstream});
  }
  const sorted = samples.map(sample => sample.value).sort((a, b) => a - b);
  const byUpstream = new Map<string, LatencySample[]>();
  for (const sample of samples) byUpstream.set(sample.upstream, [...(byUpstream.get(sample.upstream) ?? []), sample]);
  const upstreams: UpstreamLatency[] = [...byUpstream].map(([upstream, list]) => ({
    upstream,
    median: percentile(
      list.map(sample => sample.value).sort((a, b) => a - b),
      50
    )!,
    samples: list
  }));
  upstreams.sort((a, b) => b.samples.length - a.samples.length || a.upstream.localeCompare(b.upstream));
  const uncached = records.length - counts.cached;
  return {
    domains: ranked(
      records.map(record => record.question.name.replace(/\.$/, '')),
      8
    ),
    // A record without a source was asked by the resolver itself.
    devices: ranked(
      records.map(record => (record.src === null ? null : clientAddress(record.src))),
      8
    ),
    total: records.length,
    counts,
    uncached,
    samples,
    typical: percentile(sorted, 50),
    slowest: percentile(sorted, 95),
    // A failure is a lookup that got no answer; NXDOMAIN is an answer.
    failureRate: uncached ? counts.failed / uncached : null,
    cacheRate: records.length ? counts.cached / records.length : null,
    upstreams
  };
}
export type DnsAnalysis = ReturnType<typeof dnsAnalysis>;

// Counts by key, largest first then by name, keeping the first `limit` and the total of the rest.
export function ranked<K extends string | null>(keys: K[], limit: number): {top: Array<{key: K; count: number}>; rest: number} {
  const counts = new Map<K, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  // Ties go by code point, the same in every language; a missing key (null) comes last.
  const order = (a: K, b: K) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1);
  const all = [...counts].map(([key, count]) => ({key, count})).sort((a, b) => b.count - a.count || order(a.key, b.key));
  return {top: all.slice(0, limit), rest: all.slice(limit).reduce((sum, item) => sum + item.count, 0)};
}

// The client's address without its port; IPv6 stays in its brackets.
export const clientAddress = (src: string) => src.replace(/:\d+$/, '');
