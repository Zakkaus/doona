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
