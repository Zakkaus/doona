// Validation page (S2): what Config::validate collected about the on-disk revision, what the runtime does with each
// finding, and what differs from the running revision. Editing stays on the config page.
import {useState} from 'react';
import {TableView, TableHeader, Column, TableBody, Row, Cell} from '@react-spectrum/s2/TableView';
import {SegmentedControl, SegmentedControlItem} from '@react-spectrum/s2/SegmentedControl';
import {StatusLight} from '@react-spectrum/s2/StatusLight';
import {Badge} from '@react-spectrum/s2/Badge';
import {Button} from '@react-spectrum/s2/Button';
import {Text} from '@react-spectrum/s2/Text';
import {style} from '@react-spectrum/s2/style' with {type: 'macro'};
import type {Key, Selection} from '@react-spectrum/s2';
import Refresh from '@react-spectrum/s2/icons/Refresh';
import {page, split, card, between, row, code, label, list, col, h3, note, toolbar, toast} from '../ui';
import {diagnostics, pending, restartItems, runtime, sources, type Diag} from '../mock';
import type {PageProps} from '../Shell';

const LEVEL: Record<Diag['level'], {variant: 'negative' | 'notice' | 'informative', label: string}> = {error: {variant: 'negative', label: '錯誤'}, warn: {variant: 'notice', label: '警告'}, info: {variant: 'informative', label: '提示'}};
const where = (d: Diag) => (sources.find(s => s.id === d.source)?.path.split('/').pop() ?? d.source) + ':' + d.line;
const diff = style({display: 'flex', alignItems: 'center', gap: 12, minHeight: 24});
const grow = style({flexGrow: 1, color: 'gray-700', whiteSpace: 'nowrap'});
const p = style({margin: 0, font: 'body'});

export function Validate({go}: PageProps) {
  const [filter, setFilter] = useState<Key>('all');
  const [sel, setSel] = useState<Selection>(new Set());
  const errors = diagnostics.filter(d => d.level === 'error').length;
  const warns = diagnostics.filter(d => d.level === 'warn').length;
  const rows = filter === 'all' ? diagnostics : diagnostics.filter(d => d.level === filter);
  const cur = sel !== 'all' ? diagnostics.find(d => sel.has(d.id)) : undefined;
  const needRestart = pending.filter(x => x.restart);
  const open = (d: Diag) => go('config', 'src=' + (sources.find(s => s.id === d.source)?.path.split('/').pop() ?? '') + '&line=' + d.line);
  return (
    <div className={page}>
      <div className={toolbar}>
        <StatusLight variant={errors ? 'negative' : warns ? 'notice' : 'positive'}><Text>{errors ? `未通過：${errors} 個錯誤、${warns} 個警告` : warns ? `通過，${warns} 個警告` : '通過'}</Text></StatusLight>
        <Badge variant="neutral" fillStyle="subtle">磁碟 r{runtime.diskRevision}</Badge>
        <Badge variant="neutral" fillStyle="subtle">執行中 r{runtime.activeRevision}</Badge>
        <span className={grow} />
        <Button variant="primary" onPress={() => toast(errors ? 'negative' : 'positive', errors ? `校驗完成，${errors} 個錯誤` : '校驗通過')}><Refresh /><Text>重新校驗</Text></Button>
      </div>
      <p className={note}>解析階段一律寬鬆並記下每個問題，由 validate 決定哪些致命：猜錯會改變流量去向或信任邊界的拒絕，其餘用預設或夾到邊界並留下痕跡。有錯誤時 reload 不會套用。</p>
      <div className={split}>
        <div className={col}>
          <div className={between}>
            <SegmentedControl aria-label="等級" selectedKey={filter} onSelectionChange={setFilter}>
              <SegmentedControlItem id="all">全部 {diagnostics.length}</SegmentedControlItem><SegmentedControlItem id="error">錯誤 {errors}</SegmentedControlItem><SegmentedControlItem id="warn">警告 {warns}</SegmentedControlItem><SegmentedControlItem id="info">提示 {diagnostics.length - errors - warns}</SegmentedControlItem>
            </SegmentedControl>
          </div>
          <TableView aria-label="校驗結果" selectionMode="single" selectionStyle="highlight" selectedKeys={sel} onSelectionChange={setSel} styles={style({height: 360})}>
            <TableHeader><Column id="level" width={84}>等級</Column><Column id="where" width={150}>位置</Column><Column id="msg" isRowHeader>訊息</Column><Column id="action" width={88}>處理</Column></TableHeader>
            <TableBody items={rows} renderEmptyState={() => '沒有這個等級的項目'}>
              {d => <Row id={d.id}><Cell><StatusLight variant={LEVEL[d.level].variant} size="S"><Text>{LEVEL[d.level].label}</Text></StatusLight></Cell><Cell><span className={code}>{where(d)}</span></Cell><Cell>{d.msg}</Cell><Cell>{d.action}</Cell></Row>}
            </TableBody>
          </TableView>
        </div>
        <div className={col}>
          {cur && (
            <div className={card}>
              <div className={row}><StatusLight variant={LEVEL[cur.level].variant}><Text>{LEVEL[cur.level].label}</Text></StatusLight><span className={code}>{where(cur)}</span></div>
              <p className={p}>{cur.msg}</p>
              <span className={label}>為什麼{cur.action}：{cur.why}。</span>
              <Button variant="secondary" onPress={() => open(cur)}>開啟來源</Button>
            </div>
          )}
          <div className={card}>
            <div className={between}><h3 className={h3}>與執行中的差異</h3><span className={label}>r{runtime.activeRevision} → r{runtime.diskRevision}</span></div>
            <div className={list}>{pending.map(x => <div key={x.key} className={diff}><span className={code}>{x.key}</span><span className={grow}>{x.from} → {x.to}</span>{x.restart && <Badge variant="notice" fillStyle="subtle">需重啟</Badge>}</div>)}</div>
            <span className={label}>{needRestart.length ? `${needRestart.length} 項要重啟才生效，reload 只會套用其餘 ${pending.length - needRestart.length} 項。` : 'reload 可以全部套用。'}</span>
          </div>
          <div className={card}>
            <h3 className={h3}>需重啟的項</h3>
            <div className={list}>{restartItems.map(k => <span key={k} className={code}>{k}</span>)}</div>
            <span className={label}>監聽器、NFQUEUE、TProxy、DNS 綁定在啟動期決定；修改這些項目後 reload 不會生效。</span>
          </div>
        </div>
      </div>
    </div>
  );
}
