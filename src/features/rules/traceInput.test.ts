import {expect, it} from 'vitest';
import {traceInput} from './traceInput';

const form = {network: 'tcp' as const, domain: 'example.com', dst_ip: '', dst_port: '443', src_ip: '', src_port: '', pname: '', dscp: ''};

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
    ...(expected !== undefined ? {dscp: expected} : {})
  });
});

it('preserves target and optional source fields when mapping DSCP', () => {
  const fields = {...form, dst_ip: '198.51.100.20', src_ip: '10.0.0.2', src_port: '51234', pname: ' curl ', dscp: '46'};
  const input = {network: 'tcp', dst_ip: '198.51.100.20', dst_port: 443, src_ip: '10.0.0.2', src_port: 51234, pname: 'curl', dscp: 46};
  expect(traceInput(fields)).toEqual({...input, domain: 'example.com'});
  expect(traceInput({...fields, domain: ''})).toEqual(input);
});
