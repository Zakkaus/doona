import {expect, it} from 'vitest';
import {engineOf} from '../api/engines';
import {version} from '../api/mock/fixtures';
import {globalKeys} from './vocab';
import {serializeSetting, settingValue, writeSettings} from './settings';
const schema = engineOf(version).globalSettings!;
it('covers every parsed global key and rejects invalid scalar shapes', () => {
  expect(schema.fields.map(field => field.key).sort()).toEqual([...globalKeys].sort());
  for (const field of schema.fields) {
    expect(serializeSetting(field, "x'\n} routing { fallback: block")).toBeNull();
    if (field.type === 'integer') {
      expect(settingValue(field, serializeSetting(field, field.max!)!)).toBe(field.max);
      expect(serializeSetting(field, String(BigInt(field.max!) + 1n))).toBeNull();
      expect(serializeSetting(field, '-1')).toBeNull();
    }
  }
  const port = schema.fields[0];
  expect(settingValue(port, '0x10')).toBe('0x10');
  expect(serializeSetting(port, settingValue(port, '0x10'))).toBeNull();
  expect(writeSettings('global { tproxy_port: 0x10 }', schema, 0, {tproxy_port: '16'})).toBe('global { tproxy_port: 16 }');
  const mark = schema.fields.find(field => field.key === 'so_mark_from_dae')!;
  for (const [raw, expected] of [
    ['0x10', '16'],
    ['10', '16'],
    ['ff', '255'],
    ['1073741823', '1073741823'],
    ['0x1073741823', '1073741823']
  ])
    expect(settingValue(mark, raw)).toBe(expected);
  expect(serializeSetting(mark, '16')).toBe('0x10');
  expect(
    serializeSetting(
      schema.fields.find(field => field.key === 'preconnect_node_count')!,
      'auto'
    )
  ).toBe('auto');
});
it.each(['\n', '\r\n'])('preserves untouched bytes and comments with %j', newline => {
  const input = "# before\nglobal {\n\ttproxy_port: 12345 # port\n\tlog_level: 'info'\n\tunknown: 'keep'\n}\nrouting { fallback: direct }\n".replaceAll(
    '\n',
    newline
  );
  expect(writeSettings(input, schema, 0, {tproxy_port: '65535'})).toBe(input.replace('12345', '65535'));
  expect(writeSettings(input, schema, 0, {log_level: ''})).toBe(input.replace("log_level: 'info'", ''));
  expect(writeSettings(input, schema, 0, {mptcp: 'true'})).toBe(input.replace(`${newline}}`, `${newline}${newline}\tmptcp: true${newline}}`));
});
it('checks duration precision, unit grammar and multiplication overflow', () => {
  const seconds = schema.fields.find(field => field.key === 'check_interval')!;
  const milliseconds = schema.fields.find(field => field.key === 'check_tolerance')!;
  for (const value of ['18446744073709551615s', '307445734561825860m', '0.5ms', '184467440737095516160ms'])
    expect(serializeSetting(seconds, value)).toBe(value);
  for (const value of ['18446744073709551616s', '307445734561825861m', '0.5s']) expect(serializeSetting(seconds, value)).toBeNull();
  for (const value of ['18446744073709551615ms', '0.5s', '0.5']) expect(serializeSetting(milliseconds, value)).toBe(value);
  for (const value of ['18446744073709551616ms', '18446744073709551615', '1m', '0.5ms']) expect(serializeSetting(milliseconds, value)).toBeNull();
});
it('does not silently split a quoted list item containing a comma', () => {
  const field = schema.fields.find(field => field.key === 'tcp_check_url')!;
  const written = "'https://example.com/a,b', 'https://example.com/c'";
  const value = settingValue(field, written);
  expect(value).toBe("'https://example.com/a,b', https://example.com/c");
  expect(serializeSetting(field, value)).toBe(written);
  expect(writeSettings(`global { tcp_check_url: ${written} }`, schema, 0, {tcp_check_url: value.replace('/c', '/d')})).toBe(
    `global { tcp_check_url: ${written.replace('/c', '/d')} }`
  );
  expect(serializeSetting(field, "'https://example.com/a,b'")).toBeNull();
});
it('selects the requested occurrence, appends absent fields and creates an absent section', () => {
  const input = 'global { log_level: info }\nglobal { log_level: warn }';
  expect(writeSettings(input, schema, 1, {log_level: 'debug'})).toBe(input.replace('warn', 'debug'));
  expect(writeSettings('routing { fallback: direct }', schema, 0, {mptcp: 'true'})).toBe('routing { fallback: direct }\nglobal {\n  mptcp: true\n}\n');
  expect(writeSettings('global { }', schema, 0, {lan_interface: 'br0, eth0'})).toContain('lan_interface: br0, eth0');
  expect(() => writeSettings('global { log_level: info\n log_level: warn }', schema, 0, {log_level: 'debug'})).toThrow();
});
