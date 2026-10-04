import {expect, it} from 'vitest';
import {hasPreviewData, hasModulePreviewData} from './preview';
it('samples absent, empty, and zero-byte gallery sources', () => {
  for (const value of [undefined, null, {}, [], {records: []}, {tcp: [], udp: []}]) expect(hasPreviewData(value)).toBe(false);
  expect(hasPreviewData({records: [{id: 'one'}]})).toBe(true);
  const connections = {tcp: [{src: '192.0.2.1:80', download_bytes: '0', upload_bytes: '0'}], udp: []};
  expect(hasModulePreviewData('connections', connections, 'ranking')).toBe(false);
  expect(hasModulePreviewData('connections', connections, 'connectionOutbounds')).toBe(true);
  connections.tcp[0].download_bytes = '1';
  expect(hasModulePreviewData('connections', connections, 'ranking')).toBe(true);
});
it('samples outbound failures without one and DNS latency with fewer than five upstream lookups', () => {
  const outbounds = {outbounds: [{download_bytes: '9', errors: '0'}]};
  expect(hasModulePreviewData('runtimeOutbounds', outbounds, 'outbounds')).toBe(true);
  expect(hasModulePreviewData('runtimeOutbounds', outbounds, 'outboundErrors')).toBe(false);
  const lookup = (cached: boolean) => ({cached, upstream: 'tls://1.1.1.1'});
  const four = {records: [...Array.from({length: 4}, () => lookup(false)), lookup(true)]};
  expect(hasModulePreviewData('dnsLog', four, 'dnsLatency')).toBe(false);
  expect(hasModulePreviewData('dnsLog', four, 'dnsAnswers')).toBe(true);
  expect(hasModulePreviewData('dnsLog', {records: [...four.records, lookup(false)]}, 'dnsLatency')).toBe(true);
});
