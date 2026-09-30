import {translate, type Translator} from '../i18n';
import {describe, expect, it} from 'vitest';
import legacy from './templates.legacy.json';
import {defaultTemplateOptions, detectTemplate, templates, type RuleTemplate} from './templates';
import {holdsDns, holdsRouting, templateGroups, writeTemplate} from './setup';
import {readGroupEntries} from './groups';

const t: Translator = (key, params) => translate('en', key, params);
const presets: RuleTemplate[] = ['global', 'bypass', 'gfw', 'single', 'services', 'regions', 'homebound'];
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
  it.each(Object.entries(legacy))('recognises the previous %s routing', (template, routing) => {
    expect(detectTemplate(routing)).toMatchObject({template, blockAds: template !== 'global', blockQuic: true, networkManagerDirect: true});
  });

  it.each(['direct', 'block'])('treats legacy group slots targeting %s as custom routing', target => {
    for (const template of ['global', 'bypass', 'gfw'] as const) {
      expect(detectTemplate(legacy[template])).toMatchObject({template, group: 'proxy'});
      expect(detectTemplate(legacy[template].replaceAll('proxy', target))).toBeNull();
    }
  });

  it.each(presets)('finds %s written into an empty file', template => {
    expect(detectTemplate(writeTemplate('', template, [], {t}))).toEqual({
      template,
      ...defaultTemplateOptions,
      group: template === 'gfw' || template === 'global' || template === 'bypass' ? 'proxy' : null
    });
  });

  it.each(presets)('finds %s after it replaces hand-written routing', template => {
    const out = writeTemplate(existing, template, [], {t});
    expect(detectTemplate(out)?.template).toBe(template);
    // DNS routing is nested and stays as it was.
    expect(out).toContain('qname(geosite:cn) -> alidns');
  });

  it('reads the group a template routes to by its first group', () => {
    expect(detectTemplate(writeTemplate(existing, 'bypass', [], {t}))).toEqual({template: 'bypass', group: "'my proxy'", ...defaultTemplateOptions});
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
    expect(detectTemplate(text)).toEqual({template: 'global', group: 'proxy', ...defaultTemplateOptions});
  });

  it('reads nothing into hand-edited routing', () => {
    const services = writeTemplate(existing, 'services', [], {t});
    expect(detectTemplate(services.replace('fallback: proxy', 'fallback: auto'))).toBeNull();
    expect(detectTemplate(services.replace('domain(geosite:microsoft) -> direct', 'domain(geosite:microsoft) -> proxy'))).toBeNull();
    expect(detectTemplate(services.replace('  fallback: proxy', '  domain(example.org) -> direct\n  fallback: proxy'))).toBeNull();
    expect(detectTemplate(existing)).toBeNull();
    expect(detectTemplate('group { proxy {} }\n')).toBeNull();
  });

  it('needs one group wherever a template repeats its group slot', () => {
    const gfw = writeTemplate('group { a {} b {} }\n', 'gfw', [], {t});
    expect(detectTemplate(gfw)).toEqual({template: 'gfw', group: 'a', ...defaultTemplateOptions});
    expect(detectTemplate(gfw.replace('domain(geosite:gfw) -> a', 'domain(geosite:gfw) -> b'))).toBeNull();
    expect(detectTemplate(gfw.replaceAll('-> a', '-> direct'))).toBeNull();
  });

  it('counts parentheses inside routing only', () => {
    // honk reads an unquoted path with a stray `(`; the scanner's count stays raised past it.
    const text = `global {\n  log_file: /var/log/honk(.log\n}\n\n${writeTemplate('', 'gfw', [], {t})}`;
    expect(detectTemplate(text)).toEqual({template: 'gfw', group: 'proxy', ...defaultTemplateOptions});
    expect(detectTemplate(`global {\n  log_file: /var/log/honk(.log\n}\n\n${existing}`)).toBeNull();
  });

  it('reads an include in routing as custom', () => {
    const bypass = writeTemplate(existing, 'bypass', [], {t});
    expect(detectTemplate(bypass.replace(/^  fallback:/m, '  include rules.dae\n  fallback:'))).toBeNull();
  });
});

describe('writeTemplate', () => {
  it('reuses a group another file declares instead of declaring it again', () => {
    const out = writeTemplate('routing { fallback: direct }\n', 'single', [{name: 'proxy', written: 'proxy'}], {t});
    expect(readGroupEntries(out).map(entry => entry.name)).toEqual(['auto']);
    expect(templateGroups('single', ['proxy'])).toEqual(['auto']);
  });

  it('writes a group another file declares with $ in its name as written', () => {
    const out = writeTemplate('', 'gfw', [{name: "'p$&'", written: "'p$&'"}], {t});
    expect(out).toContain("domain(geosite:gfw) -> 'p$&'");
    expect(detectTemplate(out)).toEqual({template: 'gfw', group: "'p$&'", ...defaultTemplateOptions});
  });

  it('adds the default group only when no file declares any', () => {
    expect(readGroupEntries(writeTemplate('', 'global', [], {t})).map(entry => entry.name)).toEqual(['proxy']);
    expect(templateGroups('global', [])).toEqual(['proxy']);
    expect(readGroupEntries(writeTemplate('', 'global', [{name: 'elsewhere', written: 'elsewhere'}], {t}))).toEqual([]);
    expect(templateGroups('global', ['elsewhere'])).toEqual([]);
    expect(detectTemplate(writeTemplate('', 'global', [{name: 'elsewhere', written: 'elsewhere'}], {t}))).toEqual({
      template: 'global',
      group: 'elsewhere',
      ...defaultTemplateOptions
    });
  });

  it('writes the same text again when applied twice', () => {
    const once = writeTemplate(existing, 'regions', [], {t});
    expect(writeTemplate(once, 'regions', [], {t})).toBe(once);
  });
});

describe('quoted group names', () => {
  // honk keeps the quotes in a group's name, so `'proxy'` and `proxy` are two groups.
  it('declares a template group whose name a quoted group only resembles', () => {
    const text = "group {\n  'proxy' { policy: min_moving_avg }\n}\n";
    const out = writeTemplate(text, 'single', readGroupEntries(text), {t});
    expect(readGroupEntries(out).map(entry => entry.written)).toEqual(["'proxy'", 'proxy', 'auto']);
    expect(templateGroups('single', ["'proxy'"])).toEqual(['proxy', 'auto']);
  });

  it('keeps outbound names as written when reading a template back', () => {
    const gfw = writeTemplate("group { a {} 'a' {} }\n", 'gfw', [], {t});
    expect(detectTemplate(gfw)).toEqual({template: 'gfw', group: 'a', ...defaultTemplateOptions});
    expect(detectTemplate(gfw.replace('domain(geosite:gfw) -> a', "domain(geosite:gfw) -> 'a'"))).toBeNull();
    const quoted = writeTemplate("group { 'direct' {} }\n", 'global', [], {t});
    expect(detectTemplate(quoted)).toEqual({template: 'global', group: "'direct'", ...defaultTemplateOptions});
  });
});

it('tells a configuration with routing or dns blocks from one without', () => {
  expect(holdsRouting(['global {}', 'routing {\n  fallback: direct\n}'])).toBe(true);
  expect(holdsRouting(['routing {\n  # nothing yet\n}', 'dns {\n  routing {\n    request { fallback: a }\n  }\n}'])).toBe(false);
  expect(holdsRouting([''])).toBe(false);
  expect(holdsDns(['global {}', existing])).toBe(true);
  expect(holdsDns(['routing { fallback: direct }'])).toBe(false);
});

describe('template output', () => {
  it.each(presets)('writes %s without ads by default and with ads only when enabled', template => {
    const plain = writeTemplate('', template, [], {t});
    const blocked = writeTemplate('', template, [], {t, blockAds: true});
    expect(plain).not.toContain('domain(geosite:category-ads-all) -> block');
    expect(blocked).toContain('l4proto(udp) && dport(443) -> block\n  # Ads\n  domain(geosite:category-ads-all) -> block');
    expect(blocked.replace('  # Ads\n  domain(geosite:category-ads-all) -> block\n', '')).toBe(plain);
    expect(writeTemplate(blocked, template, [], {t, ...defaultTemplateOptions})).toBe(plain);
  });

  it.each(
    presets.flatMap(template =>
      [false, true].flatMap(blockAds =>
        [false, true].flatMap(blockQuic => [false, true].map(networkManagerDirect => ({template, blockAds, blockQuic, networkManagerDirect})))
      )
    )
  )('generates and detects $template with ads=$blockAds, QUIC=$blockQuic, NetworkManager=$networkManagerDirect', ({template, ...options}) => {
    const text = writeTemplate('', template, [], {t, ...options});
    for (const [enabled, lines] of [
      [options.blockAds, ['# Ads', 'domain(geosite:category-ads-all) -> block']],
      [options.blockQuic, ['# Block UDP/443', 'l4proto(udp) && dport(443) -> block']],
      [options.networkManagerDirect, ['# NetworkManager', 'pname(NetworkManager) -> direct']]
    ] as const)
      for (const line of lines) expect(text.includes(line), line).toBe(enabled);
    expect(text).toContain("dip(224.0.0.0/3, 'ff00::/8') -> direct");
    expect(text).toContain('dip(geoip:private) -> direct');
    expect(detectTemplate(text)).toMatchObject({template, ...options});
    expect(detectTemplate(text.replace(/#[^\n]*/g, ''))).toMatchObject({template, ...options});
    expect(writeTemplate(text, template, [], {t, ...options})).toBe(text);
  });

  it.each(presets)('writes the complete %s configuration', template => {
    expect(writeTemplate('', template, [], {t})).toMatchSnapshot();
  });

  it.each(['en', 'zh-CN', 'zh-TW'] as const)('writes group labels in %s', lang => {
    const local: Translator = (key, params) => translate(lang, key, params);
    const text = writeTemplate('', 'regions', [], {t: local});
    const flags: Record<string, string> = {hk: '🇭🇰', jp: '🇯🇵', us: '🇺🇸', tw: '🇹🇼', sg: '🇸🇬', kr: '🇰🇷'};
    for (const group of templates.regions.groups)
      expect(text).toContain(`  # ${flags[group.name] ? flags[group.name] + ' ' : ''}${local(group.label)}\n  ${group.name} {`);
    const home = writeTemplate('', 'homebound', [], {t: local});
    expect(home).toContain(`  # 🇨🇳 ${{en: 'Mainland China', 'zh-CN': '回国节点', 'zh-TW': '回國節點'}[lang]}\n  cn {`);
  });

  it('creates the mainland group and keeps other traffic direct', () => {
    const text = writeTemplate('', 'homebound', [], {t});
    expect(readGroupEntries(text).map(group => group.name)).toEqual(['cn']);
    expect(text).toContain('policy: min_moving_avg');
    expect(text).toContain('domain(geosite:cn) -> cn');
    expect(text).toContain('dip(geoip:cn) -> cn');
    expect(text).toContain('fallback: direct');
    expect(templateGroups('homebound', ['cn'])).toEqual([]);
    expect(readGroupEntries(writeTemplate('group { cn {} }\n', 'homebound', [], {t}))).toHaveLength(1);
  });

  it('selects mainland nodes only', () => {
    // honk uses Rust regex (crates/honk-config/src/parser/groups.rs); explicit ASCII letter boundaries also work in JS.
    const filter = templates.homebound.groups[0].lines[0].match(/^filter: name\(regex: '(.+)'\) && !name\(regex: '(.+)'\)$/)!;
    for (const pattern of filter.slice(1)) expect(pattern).not.toContain(String.raw`\b`);
    const [include, exclude] = [filter[1], filter[2]].map(pattern => new RegExp(pattern.replace(/^\(\?i\)/, ''), 'iu'));
    const picks = (name: string) => include.test(name) && !exclude.test(name);
    for (const name of ['回国 01', '中国电信 上海', '大陸 A', 'China Mobile 1', 'CN-SH-01', 'Mainland 2']) expect(picks(name), name).toBe(true);
    for (const name of [
      '中国香港 01',
      '中國台灣',
      'HK-01 China',
      'US-Chinatown',
      'JP-Mainlander',
      'CNN relay',
      '日本国内',
      'Macau CN',
      'China-HK01',
      'CN-TW01',
      '中国 HK日本',
      'Macau-01',
      'China Macau-01',
      'CN-MO01',
      'China-HK_01',
      'CN-TW/01'
    ])
      expect(picks(name), name).toBe(false);
  });

  it.each(presets)('detects %s regardless of generated comments', template => {
    const text = writeTemplate('', template, [], {t});
    expect(detectTemplate(text.replace(/#[^\n]*/g, '# old comment'))?.template).toBe(template);
    expect(detectTemplate(text.replace(/#[^\n]*/g, ''))?.template).toBe(template);
  });
});
