import type {Api} from '../../api/api';
import type {DnsQueryResponse} from '../../api/model';
import {ApiError} from '../../api/error';
import {wait} from '../../api/wait';

export async function queryTypes(query: Api['dnsQuery'], domain: string, types: string[], limit: number, signal: AbortSignal): Promise<DnsQueryResponse> {
  const size = Math.max(1, Math.floor(limit));
  let response: DnsQueryResponse | undefined;
  for (let start = 0; start < types.length; start += size) {
    signal.throwIfAborted();
    const batch = types.slice(start, start + size);
    let part: DnsQueryResponse;
    for (let refused = 0; ; refused++) {
      try {
        part = await query(domain, batch, signal);
        break;
      } catch (error) {
        signal.throwIfAborted();
        if (!(error instanceof ApiError) || !error.transient || refused >= 3) throw error;
        await wait(error.retryAfter!, signal);
      }
    }
    signal.throwIfAborted();
    if (response) response.results.push(...part.results);
    else response = {...part, results: [...part.results]};
  }
  if (!response) throw new Error('DNS query requires at least one record type');
  return response;
}
