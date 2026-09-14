// Search like the S2 docs site: a field-shaped trigger (RAC Button + style macro), Cmd/Ctrl+K, and a large CustomDialog
// with the SearchField on top, a scope switch, and grouped results from connections, nodes and rules.
import {useEffect, useMemo, useState} from 'react';
import {Button} from 'react-aria-components';
import {ActionButton} from '@react-spectrum/s2/ActionButton';
import {CustomDialog, DialogTrigger, CloseButton} from '@react-spectrum/s2/CustomDialog';
import {SearchField} from '@react-spectrum/s2/SearchField';
import {SegmentedControl, SegmentedControlItem} from '@react-spectrum/s2/SegmentedControl';
import {Menu, MenuItem, MenuSection, Header, Heading, Text} from '@react-spectrum/s2/Menu';
import {style, focusRing, iconStyle} from '@react-spectrum/s2/style' with {type: 'macro'};
import type {Key} from '@react-spectrum/s2';
import Search from '@react-spectrum/s2/icons/Search';
import {conns, groups, rules} from './mock';

const trigger = style({
  ...focusRing(),
  display: 'flex', alignItems: 'center', gap: 8, width: 'full', maxWidth: 500, height: 40, boxSizing: 'border-box',
  paddingStart: 20, paddingEnd: 12, borderRadius: 'full', borderWidth: 2, borderStyle: 'solid',
  borderColor: {default: 'gray-300', isHovered: 'gray-400', isFocusVisible: 'gray-400'},
  backgroundColor: 'base', font: 'ui-lg', fontWeight: 'normal', color: 'gray-600', cursor: 'text', textAlign: 'start'
});
const label = style({flexGrow: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis'});
const kbd = style({font: 'ui-sm', color: 'gray-700', borderWidth: 1, borderStyle: 'solid', borderColor: 'gray-300', borderRadius: 'full', paddingX: 8, paddingY: 2, backgroundColor: 'gray-75', fontFamily: 'sans'});
const body = style({display: 'flex', flexDirection: 'column', gap: 16, minHeight: 480});
const top = style({display: 'flex', alignItems: 'center', gap: 16, paddingEnd: 48});
const results = style({maxHeight: 480, overflow: 'auto', paddingEnd: 12});
const empty = style({font: 'body', color: 'gray-600', paddingY: 32, textAlign: 'center'});

type Scope = 'all' | 'conns' | 'nodes' | 'rules';
const NODES = [...new Set(groups.flatMap(g => g.nodes.map(n => n.name)))];
export function SearchTrigger({placeholder, labels, go, compact}: {placeholder: string, labels: {all: string, conns: string, nodes: string, rules: string, none: string}, go: (route: string, query?: string) => void, compact?: boolean}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<Key>('all');
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(true); } };
    addEventListener('keydown', f); return () => removeEventListener('keydown', f);
  }, []);
  const hit = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase());
  const show = (k: Scope) => scope === 'all' || scope === k;
  const found = useMemo(() => ({
    conns: show('conns') ? conns.filter(c => hit([c.host, c.dst, c.src, c.out].join(' '))) : [],
    nodes: show('nodes') ? NODES.filter(hit) : [],
    rules: show('rules') ? rules.filter(r => hit(r.cond + ' ' + r.target)) : []
  }), [q, scope]);
  const total = found.conns.length + found.nodes.length + found.rules.length;
  const pick = (k: Key) => { const [kind, v] = String(k).split(':'); setOpen(false); go(kind === 'rule' ? 'rules' : kind === 'node' ? 'policies' : 'connections', kind === 'conn' ? 'q=' + encodeURIComponent(v) : undefined); };
  return (
    <DialogTrigger isOpen={open} onOpenChange={o => { setOpen(o); if (!o) setQ(''); }}>
      {compact ? <ActionButton isQuiet aria-label={placeholder}><Search /></ActionButton> : (
        <Button className={trigger}>
          <Search styles={iconStyle({size: 'L', color: 'gray'})} />
          <span className={label}>{placeholder}</span>
          <kbd className={kbd}>{navigator.platform.startsWith('Mac') ? '⌘K' : 'Ctrl K'}</kbd>
        </Button>
      )}
      <CustomDialog size="L" isDismissible>
        <div className={body}>
          <div className={top}>
            <SearchField size="L" autoFocus aria-label={placeholder} placeholder={placeholder} value={q} onChange={setQ} styles={style({flexGrow: 1})} />
            <CloseButton styles={style({position: 'absolute', top: 12, insetEnd: 12})} />
          </div>
          <SegmentedControl aria-label={placeholder} selectedKey={scope} onSelectionChange={setScope}>
            <SegmentedControlItem id="all">{labels.all}</SegmentedControlItem>
            <SegmentedControlItem id="conns">{labels.conns}</SegmentedControlItem>
            <SegmentedControlItem id="nodes">{labels.nodes}</SegmentedControlItem>
            <SegmentedControlItem id="rules">{labels.rules}</SegmentedControlItem>
          </SegmentedControl>
          <div className={results + ' thin-scroll'}>
            {total === 0 ? <div className={empty}>{labels.none}</div> : (
              <Menu aria-label={placeholder} onAction={pick}>
                {found.conns.length > 0 && <MenuSection><Header><Heading>{labels.conns}</Heading></Header>{found.conns.map(c => <MenuItem key={c.id} id={'conn:' + (c.host || c.dst)} textValue={c.host || c.dst}><Text slot="label">{c.host || c.dst}</Text><Text slot="description">{c.src} → {c.chain.join(' → ')}</Text></MenuItem>)}</MenuSection>}
                {found.nodes.length > 0 && <MenuSection><Header><Heading>{labels.nodes}</Heading></Header>{found.nodes.map(n => <MenuItem key={n} id={'node:' + n} textValue={n}>{n}</MenuItem>)}</MenuSection>}
                {found.rules.length > 0 && <MenuSection><Header><Heading>{labels.rules}</Heading></Header>{found.rules.map(r => <MenuItem key={r.id} id={'rule:' + r.id} textValue={r.cond}><Text slot="label">{r.cond}</Text><Text slot="description">{r.target}{r.must ? '(must)' : ''}</Text></MenuItem>)}</MenuSection>}
              </Menu>
            )}
          </div>
        </div>
      </CustomDialog>
    </DialogTrigger>
  );
}
