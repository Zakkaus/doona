import {expect, it} from 'vitest';
import {engineOf} from '../../api/engines';
import {numberSetting} from '../../dae/settings';

// The rules in CONTRIBUTING's kit section: the kit Form wraps every form, and a typed whole number edits in a NumberField.
const sources = import.meta.glob<string>(['/src/features/**/*.tsx', '/src/shell/**/*.tsx', '!/src/**/*.test.*'], {
  query: '?raw',
  import: 'default',
  eager: true
});

it('writes no bare form in a feature or the shell', () => {
  expect(Object.keys(sources).filter(path => /<form[\s>]/.test(sources[path]))).toEqual([]);
});

it('edits every whole-number setting in a number field unless it is a listed exception', () => {
  const safe = BigInt(Number.MAX_SAFE_INTEGER);
  const integers = engineOf({engine: {name: 'honk'}} as Parameters<typeof engineOf>[0]).globalSettings!.fields.filter(field => field.type === 'integer');
  const exception = (field: (typeof integers)[number]) => !!field.hexMax || !!field.choices || BigInt(field.max ?? 0) > safe;
  expect(integers.filter(field => numberSetting(field) === exception(field)).map(field => field.key)).toEqual([]);
  expect(integers.filter(numberSetting).map(field => field.key)).toEqual(['tproxy_port', 'pprof_port']);
  // The page renders the number field for exactly those settings.
  expect(sources['/src/features/config/GlobalSettings.tsx']).toMatch(/field\.number \? \(\s*<NumberField/);
  expect(
    import.meta.glob<string>('/src/features/config/useGlobalSettings.ts', {query: '?raw', import: 'default', eager: true})[
      '/src/features/config/useGlobalSettings.ts'
    ]
  ).toMatch(/number: numberSetting\(definition\)/);
});
