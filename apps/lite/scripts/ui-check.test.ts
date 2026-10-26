import {afterAll, describe, expect, it} from 'vitest';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';

const base = resolve(process.env.LITE_TEST_CACHE ?? tmpdir());
mkdirSync(base, {recursive: true});
const fixture = mkdtempSync(join(base, 'ui-check-'));
mkdirSync(join(fixture, 'src'));
const shell =
  "const nav = [{id: 'nodes', icon: Data}, {id: 'subscriptions', icon: Download}, {id: 'groups', icon: Share}, {id: 'routing', icon: ListBulleted}, {id: 'dns', icon: GlobeGrid}];";
const check = (source: string, shellSource = shell) => {
  writeFileSync(join(fixture, 'src/Shell.tsx'), shellSource);
  writeFileSync(join(fixture, 'src/Example.tsx'), source);
  return spawnSync(process.execPath, [fileURLToPath(new URL('../tools/check-ui.mjs', import.meta.url)), fixture], {encoding: 'utf8'});
};
afterAll(() => rmSync(fixture, {recursive: true, force: true}));

describe('UI boundary negative controls', () => {
  it('accepts the shared patterns and local icons', () => {
    expect(
      check(
        "import {Add} from './ui/icons'; const Page = () => { const ready = true; usePageMotion(ready); return <VStack gap={4}><Heading level={1}>Nodes</Heading><RowEntrance><Table /></RowEntrance></VStack>; }"
      ).status
    ).toBe(0);
  });
  it.each([
    ['layout', '<div><span>Layout</span></div>'],
    ['tokens', '<VStack style={{padding: "12px"}} />'],
    ['colors', '<VStack style={{color: "#fff"}} />'],
    ['colors', '<VStack style={{background: "rgb(0 0 0 / 72%)"}} />'],
    ['colors', '<VStack style={{color: "white"}} />'],
    ['colors', '<path fill="black" />'],
    ['spacing', '<VStack gap={7} />'],
    ['grid', '<Grid columns={{minWidth: 320}} />'],
    ['rows', '<Table />'],
    ['number-input', '<NumberInput hasClear />'],
    ['number-input', '<NumberInput hasNumberSteppers />'],
    ['number-input', '<NumberInput hasNumberSteppers={false} />'],
    ['ready', '<Heading level={1}>Nodes</Heading>'],
    ['icon-import', "import {Add} from '../../../src/ui/icons';"],
    ['icon-import', "const icons = import('../../../src/ui/icons/Add');"],
    ['icon-import', "import {Add} from './ui/icons-other';"]
  ])('rejects %s violations', (rule, source) => {
    const result = check(source);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`[${rule}]`);
  });
  it('rejects duplicate navigation icons', () => {
    const result = check('<VStack />', shell.replace('icon: Share', 'icon: Data'));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[icons]');
  });
  it('rejects raw CSS colours', () => {
    const css = join(fixture, 'src/Example.css');
    writeFileSync(css, '.example { color: #fff; }');
    try {
      const result = check('<VStack />');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('[colors]');
    } finally {
      rmSync(css);
    }
  });
});
