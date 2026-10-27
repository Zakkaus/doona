import {expect, it} from 'vitest';
import {isMark, traceInput} from './traceInput';

const form = {network: 'tcp' as const, domain: 'example.com', dst_ip: '', dst_port: '443', src_ip: '', src_port: '', pname: '', dscp: '', mark: ''};

it.each([
  ['', ''],
  ['  ', ''],
  [' curl ', 'curl']
])('maps process %j to an explicit trimmed value', (pname, expected) => {
  expect(traceInput({...form, pname})).toStrictEqual({network: 'tcp', domain: 'example.com', dst_port: 443, pname: expected});
});

it.each([
  ['', undefined],
  ['  ', undefined],
  ['0', 0],
  ['46', 46],
  ['63', 63]
] as const)('maps optional DSCP %j without sending an empty value', (dscp, expected) => {
  expect(traceInput({...form, dscp})).toStrictEqual({
    network: 'tcp',
    domain: 'example.com',
    dst_port: 443,
    pname: '',
    ...(expected !== undefined ? {dscp: expected} : {})
  });
});

it('preserves target and optional source fields when mapping DSCP', () => {
  const fields = {...form, dst_ip: '198.51.100.20', src_ip: '10.0.0.2', src_port: '51234', pname: ' curl ', dscp: '46'};
  const input = {network: 'tcp', dst_ip: '198.51.100.20', dst_port: 443, src_ip: '10.0.0.2', src_port: 51234, pname: 'curl', dscp: 46};
  expect(traceInput(fields)).toEqual({...input, domain: 'example.com'});
  expect(traceInput({...fields, domain: ''})).toEqual(input);
});

it.each([
  ['', undefined],
  ['  ', undefined],
  ['0', 0],
  [' 255 ', 255],
  ['0x1', 1],
  ['0XfF', 255],
  ['4294967295', 4294967295],
  ['0xffffffff', 4294967295],
  ['000010', 10],
  ['0x000000001', 1],
  ['0x0ffffffff', 4294967295]
] as const)('maps optional mark %j, decimal or hexadecimal, without sending an empty value', (mark, expected) => {
  expect(traceInput({...form, mark})).toStrictEqual({
    network: 'tcp',
    domain: 'example.com',
    dst_port: 443,
    pname: '',
    ...(expected !== undefined ? {mark: expected} : {})
  });
});

it.each(['0', '1', '0x0', '0x1', '0XAB', ' 0x10 ', '4294967295', '0xffffffff'])('accepts mark %j', value => {
  expect(isMark(value)).toBe(true);
});

it.each(['', '4294967296', '0x100000000', '-1', '1.5', '1e3', '0x', '0b1', '0o7', 'mark', '0x1g', '1 2'])('rejects mark %j', value => {
  expect(isMark(value)).toBe(false);
});
