import {LocalError} from '../../api/error';
import {expect, it} from 'vitest';
import {readMode, sameMode, writeMode} from './mode';

const config = `global {
    log_level: info
}

dns {
    routing {
        request {
            fallback: lab
        }
    }
}

routing {
    dip(geoip: private) -> direct(must)
    pname(NetworkManager) -> direct(must) # keep
    domain(geosite: cn) -> direct
    fallback: proxy
}
`;

it('reads the configuration as rule mode until a marked rule is present', () => {
  expect(readMode(config)).toEqual({mode: 'rule'});
  expect(readMode(writeMode(config, {mode: 'direct'}))).toEqual({mode: 'direct'});
  expect(readMode(writeMode(config, {mode: 'global', target: 'proxy'}))).toEqual({mode: 'global', target: 'proxy'});
});

it('inserts the catch-all after the last must rule and replaces or removes it cleanly', () => {
  const direct = writeMode(config, {mode: 'direct'});
  expect(direct.split('\n')[15]).toBe('    l4proto(tcp, udp) -> direct # doona: outbound mode');
  expect(direct.split('\n')[14]).toContain('(must) # keep');
  // The dns section's own routing block is not the one.
  expect(direct.split('\n').slice(4, 11).join('\n')).not.toContain('doona');
  const global = writeMode(direct, {mode: 'global', target: 'proxy'});
  expect(global.match(/doona: outbound mode/g)).toHaveLength(1);
  expect(global).toContain('l4proto(tcp, udp) -> proxy # doona: outbound mode');
  expect(writeMode(global, {mode: 'rule'})).toBe(config);
});

it('goes to the top of a routing section without must rules and refuses a text without one', () => {
  const plain = 'routing {\n  fallback: direct\n}\n';
  expect(writeMode(plain, {mode: 'direct'})).toBe('routing {\n  l4proto(tcp, udp) -> direct # doona: outbound mode\n  fallback: direct\n}\n');
  expect(() => writeMode('global {}\n', {mode: 'direct'})).toThrow(LocalError);
});

it('compares modes by target only for global', () => {
  expect(sameMode({mode: 'global', target: 'a'}, {mode: 'global', target: 'b'})).toBe(false);
  expect(sameMode({mode: 'direct'}, {mode: 'direct'})).toBe(true);
  expect(sameMode({mode: 'rule'}, {mode: 'direct'})).toBe(false);
});

it('ignores quoted and nested routing text and supports a single-line routing section', () => {
  const source = `node { n: 'https://example.org/{#}' }
dns { routing { request {
  l4proto(tcp, udp) -> nested # doona: outbound mode
} } }
routing { fallback: proxy }
`;
  expect(readMode(source)).toEqual({mode: 'rule'});
  const written = writeMode(source, {mode: 'direct'});
  expect(written).toContain(source.slice(0, source.lastIndexOf('routing {')));
  expect(written).toContain('routing {\n    l4proto(tcp, udp) -> direct # doona: outbound mode\n fallback: proxy }');
  expect(readMode(written)).toEqual({mode: 'direct'});
  expect(writeMode(written, {mode: 'rule'})).toContain('l4proto(tcp, udp) -> nested # doona: outbound mode');
});
