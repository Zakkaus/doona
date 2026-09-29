import {expect, it} from 'vitest';
import ts from 'typescript';
import {scanLiterals} from './i18n-literals.mjs';

const scan = (source, path = 'src/view.tsx') =>
  scanLiterals(path, ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)).map(failure => failure.split(': ').pop());

it('finds text the page shows and CJK in any string', () => {
  expect(
    scan(`
      const title = '設定';
      const view = <><p>Hello there</p><img alt="An image" /><input placeholder={busy ? 'Loading' : t('x')} />
        <button aria-label={\`Open \${name} menu\`}>{ok && 'Done'}</button></>;
      toast('negative', 'Save failed');
      const more = <><Card note="Loading data" /><StaticField description="Saved here" /><p>{'Hello ' + name}</p></>;
    `)
  ).toEqual(['設定', 'Hello there', 'An image', 'Loading', 'Open ${} menu', 'Done', 'Save failed', 'Loading data', 'Saved here', 'Hello']);
});

it('allows a sample only in the file and place it is listed for', () => {
  expect(scan('<TextField placeholder="auto" />', 'src/features/config/Wizard.tsx')).toEqual([]);
  expect(scan('<><button>auto</button><TextField label="auto" /></>', 'src/features/config/Wizard.tsx')).toEqual(['auto', 'auto']);
  expect(scan('<TextField placeholder="auto" />', 'src/features/dns/Dns.tsx')).toEqual(['auto']);
});

it('ignores identifiers, styling, test files and data files', () => {
  expect(scan('const id = `source-${n}`; const view = <div className="rp-list wide" data-kind="status" />;')).toEqual([]);
  expect(scan('<p>Hello there</p>', 'src/view.test.tsx')).toEqual([]);
  expect(scan("const rules = ['# 香港 nodes'];", 'src/dae/templates.ts')).toEqual([]);
});
