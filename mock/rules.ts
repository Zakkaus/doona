import {templateRules} from '../src/dae/templates';
export type ConfigRule = {id: string; cond: string; target: string; must: boolean};
export const rules: ConfigRule[] = templateRules('regions')
  .filter(line => !line.startsWith('#'))
  .map((line, index) => {
    const [cond, target] = line.split(' -> ');
    return {
      id:
        (
          {
            'pname(NetworkManager)': 'r1',
            'dip(geoip:private)': 'r2',
            'l4proto(udp) && dport(443)': 'r3',
            'domain(geosite:cn)': 'r4',
            'domain(geosite:telegram)': 'r5',
            'domain(geosite:openai)': 'r7'
          } as Record<string, string>
        )[cond] ?? `template-${index + 1}`,
      cond,
      target,
      must: false
    };
  });
// The faults scenario's extra rule uses a category the lite geodata files lack, so updating from them fails.
export const faultRules: ConfigRule[] = [{id: 'r9', cond: 'domain(geosite: category-ads-all)', target: 'block', must: false}];
