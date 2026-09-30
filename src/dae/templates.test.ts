import {describe, expect, it} from 'vitest';
import {detectTemplate, templates, type RuleTemplate} from './templates';
import {templateGroups, writeTemplate} from './setup';
import {readGroupEntries} from './groups';

const presets = Object.keys(templates) as RuleTemplate[];
const existing = `group {
  'my proxy' { filter: name(hk-01) policy: min_moving_avg }
}

dns {
  routing {
    request {
      qname(geosite:cn) -> alidns
      fallback: cloudflare
    }
  }
}

routing {
  domain(geosite:cn) -> direct
  fallback: 'my proxy'
}
`;

describe('detectTemplate', () => {
  it.each(presets)('finds %s written into an empty file', template => {
    expect(detectTemplate(writeTemplate('', template, []))).toEqual({
      template,
      group: template === 'gfw' || template === 'global' || template === 'bypass' ? 'proxy' : null
    });
  });

  it.each(presets)('finds %s after it replaces hand-written routing', template => {
    const out = writeTemplate(existing, template, []);
    expect(detectTemplate(out)?.template).toBe(template);
    // DNS routing is nested and stays as it was.
    expect(out).toContain('qname(geosite:cn) -> alidns');
  });

  it('reads the group a template routes to by its first group', () => {
    expect(detectTemplate(writeTemplate(existing, 'bypass', []))).toEqual({template: 'bypass', group: "'my proxy'"});
  });

  it('ignores spacing, comments and line breaks inside parentheses', () => {
    const text = `routing {
      # mine
      pname( NetworkManager )->direct
      dip(224.0.0.0/3,
          "ff00::/8") -> direct   # multicast
      dip(geoip: private) -> direct
      l4proto(udp)&&dport(443) -> block
      fallback:   proxy
    }`;
    expect(detectTemplate(text)).toEqual({template: 'global', group: 'proxy'});
  });

  it('reads nothing into hand-edited routing', () => {
    const standard = writeTemplate(existing, 'standard', []);
    expect(detectTemplate(standard.replace('fallback: proxy', 'fallback: auto'))).toBeNull();
    expect(detectTemplate(standard.replace('domain(geosite:microsoft) -> direct', 'domain(geosite:microsoft) -> proxy'))).toBeNull();
    expect(detectTemplate(standard.replace('  fallback: proxy', '  domain(example.org) -> direct\n  fallback: proxy'))).toBeNull();
    expect(detectTemplate(existing)).toBeNull();
    expect(detectTemplate('group { proxy {} }\n')).toBeNull();
  });

  it('needs one group wherever a template repeats its group slot', () => {
    const gfw = writeTemplate('group { a {} b {} }\n', 'gfw', []);
    expect(detectTemplate(gfw)).toEqual({template: 'gfw', group: 'a'});
    expect(detectTemplate(gfw.replace('domain(geosite:gfw) -> a', 'domain(geosite:gfw) -> b'))).toBeNull();
    expect(detectTemplate(gfw.replaceAll('-> a', '-> direct'))).toBeNull();
  });

  it('reads an include in routing as custom', () => {
    const bypass = writeTemplate(existing, 'bypass', []);
    expect(detectTemplate(bypass.replace(/^  fallback:/m, '  include rules.dae\n  fallback:'))).toBeNull();
  });
});

describe('writeTemplate', () => {
  it('reuses a group another file declares instead of declaring it again', () => {
    const out = writeTemplate('routing { fallback: direct }\n', 'mini', [{name: 'proxy', written: 'proxy'}]);
    expect(readGroupEntries(out).map(entry => entry.name)).toEqual(['auto']);
    expect(templateGroups('mini', ['proxy'])).toEqual(['auto']);
  });

  it('adds the default group only when no file declares any', () => {
    expect(readGroupEntries(writeTemplate('', 'global', [])).map(entry => entry.name)).toEqual(['proxy']);
    expect(templateGroups('global', [])).toEqual(['proxy']);
    expect(readGroupEntries(writeTemplate('', 'global', [{name: 'elsewhere', written: 'elsewhere'}]))).toEqual([]);
    expect(templateGroups('global', ['elsewhere'])).toEqual([]);
    expect(detectTemplate(writeTemplate('', 'global', [{name: 'elsewhere', written: 'elsewhere'}]))).toEqual({template: 'global', group: 'elsewhere'});
  });

  it('writes the same text again when applied twice', () => {
    const once = writeTemplate(existing, 'full', []);
    expect(writeTemplate(once, 'full', [])).toBe(once);
  });
});

describe('quoted group names', () => {
  // honk keeps the quotes in a group's name, so `'proxy'` and `proxy` are two groups.
  it('declares a template group whose name a quoted group only resembles', () => {
    const text = "group {\n  'proxy' { policy: min_moving_avg }\n}\n";
    const out = writeTemplate(text, 'mini', readGroupEntries(text));
    expect(readGroupEntries(out).map(entry => entry.written)).toEqual(["'proxy'", 'proxy', 'auto']);
    expect(templateGroups('mini', ["'proxy'"])).toEqual(['proxy', 'auto']);
  });

  it('keeps outbound names as written when reading a template back', () => {
    const gfw = writeTemplate("group { a {} 'a' {} }\n", 'gfw', []);
    expect(detectTemplate(gfw)).toEqual({template: 'gfw', group: 'a'});
    expect(detectTemplate(gfw.replace('domain(geosite:gfw) -> a', "domain(geosite:gfw) -> 'a'"))).toBeNull();
    const quoted = writeTemplate("group { 'direct' {} }\n", 'global', []);
    expect(detectTemplate(quoted)).toEqual({template: 'global', group: "'direct'"});
  });
});
