import {available, type WidgetId} from './layout';
import type {Capabilities, ConnectionList, RuntimeOutbounds} from '../../api/model';
import {parseU64} from '../../api/u64';

export function hasPreviewData(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value !== 'object') return true;
  const data = value as Record<string, unknown>;
  for (const key of ['records', 'providers', 'samples', 'outbounds']) if (Array.isArray(data[key])) return data[key].length > 0;
  if ('tcp' in data && 'udp' in data) return hasPreviewData(data.tcp) || hasPreviewData(data.udp);
  return Object.keys(data).length > 0;
}
export function hasModulePreviewData(name: string, data: unknown, id: WidgetId) {
  if (!hasPreviewData(data)) return false;
  if (name === 'capabilities') return available(id, data as Capabilities);
  if (name === 'connections' && id === 'ranking')
    return [...(data as ConnectionList).tcp, ...(data as ConnectionList).udp].some(row => row.src && (parseU64(row.download_bytes) ?? 0n) > 0n);
  if (name === 'runtimeOutbounds') return (data as RuntimeOutbounds).outbounds.some(row => (parseU64(row.download_bytes) ?? 0n) > 0n);
  return true;
}
