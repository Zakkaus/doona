import {describe, expect, it} from 'vitest';
import {testInput} from '../src/routingTest';

describe('routing tester input', () => {
  it.each([
    ['https://example.com:8443/a?q=1#fragment', {domain: 'example.com', dst_port: 8443}],
    ['http://example.com/a', {domain: 'example.com', dst_port: 80}],
    ['ftp://example.com:21/a', {domain: 'example.com', dst_port: 21}],
    ['[2001:db8::1]:443', {dst_ip: '2001:db8::1', dst_port: 443}],
    ['2001:db8::1', {dst_ip: '2001:db8::1', dst_port: 443}],
    ['1.2.3.4', {dst_ip: '1.2.3.4', dst_port: 443}]
  ])('keeps the destination and port in %s', (value, destination) => {
    expect(testInput(value, null, 'tcp')).toEqual({...destination, network: 'tcp', pname: ''});
  });
  it('uses explicit protocol and port conditions', () => {
    expect(testInput('https://example.com:8443/a', 53, 'udp')).toEqual({domain: 'example.com', dst_port: 53, network: 'udp', pname: ''});
  });
  it.each(['', 'example .com', 'https://user:secret@example.com', 'example.com:65536'])('rejects an invalid address without sending credentials: %s', value => {
    expect(() => testInput(value, null, 'tcp')).toThrow();
  });
});
