import type {Api} from '../../api/api';
import type {DnsQueryResponse} from '../../api/model';

export async function queryTypes(query: Api['dnsQuery'], domain: string, types: string[], limit: number, signal: AbortSignal): Promise<DnsQueryResponse> {
  const size = Math.max(1, Math.floor(limit));
  let response: DnsQueryResponse | undefined;
  for (let start = 0; start < types.length; start += size) {
    signal.throwIfAborted();
    const batch = types.slice(start, start + size);
    // Transient refusals are waited out by the client itself; this only batches record types.
    const part = await query(domain, batch, signal);
    signal.throwIfAborted();
    if (response) response.results.push(...part.results);
    else response = {...part, results: [...part.results]};
  }
  if (!response) throw new Error('DNS query requires at least one record type');
  return response;
}
