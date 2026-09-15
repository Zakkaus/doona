// Validation page: everything Config::validate collected about the on-disk revision, what the runtime does with each
// finding, and what differs from the running revision. Editing lives on the config page.
import {useState} from 'react';
import Refresh from '@react-spectrum/s2/icons/Refresh';
import {diagnostics, pending, restartItems, runtime, sources, type Diag} from '../../app/mock';
import {Badge, Button, DataTable, Light, Segmented, toast} from '../ui';
import type {PageProps} from './types';

const LEVEL: Record<Diag['level'], {tone: 'err' | 'warn' | 'info', label: string}> = {error: {tone: 'err', label: '錯誤'}, warn: {tone: 'warn', label: '警告'}, info: {tone: 'info', label: '提示'}};
const where = (d: Diag) => (sources.find(s => s.id === d.source)?.path.split('/').pop() ?? d.source) + ':' + d.line;

export function Validate({go}: PageProps) {
  const [filter, setFilter] = useState('all');
  const [sel, setSel] = useState<string | null>(null);
  const errors = diagnostics.filter(d => d.level === 'error').length;
  const warns = diagnostics.filter(d => d.level === 'warn').length;
  const rows = filter === 'all' ? diagnostics : diagnostics.filter(d => d.level === filter);
  const cur = diagnostics.find(d => d.id === sel);
  const needRestart = pending.filter(p => p.restart);
  const open = (d: Diag) => go('config', 'src=' + (sources.find(s => s.id === d.source)?.path.split('/').pop() ?? '') + '&line=' + d.line);
  return (
    <div className="rp-page">
      <div className="rp-toolbar">
        <Light tone={errors ? 'err' : warns ? 'warn' : 'ok'}>{errors ? `未通過：${errors} 個錯誤、${warns} 個警告` : warns ? `通過，${warns} 個警告` : '通過'}</Light>
        <Badge>磁碟 r{runtime.diskRevision}</Badge>
        <Badge>執行中 r{runtime.activeRevision}</Badge>
        <span className="rp-grow" />
        <Button primary onPress={() => toast(errors ? 'negative' : 'positive', errors ? `校驗完成，${errors} 個錯誤` : '校驗通過')}><Refresh />重新校驗</Button>
      </div>
      <p className="rp-note">解析階段一律寬鬆並記下每個問題，由 validate 決定哪些致命：猜錯會改變流量去向或信任邊界的拒絕，其餘用預設或夾到邊界並留下痕跡。有錯誤時 reload 不會套用。</p>
      <div className="rp-split">
        <div className="rp-col">
          <div className="rp-between">
            <Segmented label="等級" value={filter} onChange={setFilter} items={[['all', `全部 ${diagnostics.length}`], ['error', `錯誤 ${errors}`], ['warn', `警告 ${warns}`], ['info', `提示 ${diagnostics.length - errors - warns}`]]} />
          </div>
          <DataTable label="校驗結果" height={360} rows={rows} selected={sel} onSelect={setSel} empty="沒有這個等級的項目"
            cols={[{id: 'level', label: '等級', width: 88}, {id: 'where', label: '位置', width: 140}, {id: 'msg', label: '訊息', isRowHeader: true}, {id: 'action', label: '處理', width: 96}]}
            render={d => [<Light small tone={LEVEL[d.level].tone}>{LEVEL[d.level].label}</Light>, <span className="rp-code">{where(d)}</span>, d.msg, d.action]} />
        </div>
        <div className="rp-col">
          {cur && (
            <div className="rp-card">
              <div className="rp-row"><Light tone={LEVEL[cur.level].tone}>{LEVEL[cur.level].label}</Light><span className="rp-code">{where(cur)}</span></div>
              <p className="rp-p">{cur.msg}</p>
              <span className="rp-label">為什麼{cur.action}：{cur.why}。</span>
              <Button secondary onPress={() => open(cur)}>開啟來源</Button>
            </div>
          )}
          <div className="rp-card">
            <div className="rp-row"><h3 className="rp-h3">與執行中的差異</h3><span className="rp-label">r{runtime.activeRevision} → r{runtime.diskRevision}</span></div>
            <div className="rp-list">{pending.map(p => <div key={p.key} className="rp-diff"><span className="rp-code">{p.key}</span><span className="v">{p.from} → {p.to}</span>{p.restart && <Badge tone="warn">需重啟</Badge>}</div>)}</div>
            <span className="rp-label">{needRestart.length ? `${needRestart.length} 項要重啟才生效，reload 只會套用其餘 ${pending.length - needRestart.length} 項。` : 'reload 可以全部套用。'}</span>
          </div>
          <div className="rp-card">
            <h3 className="rp-h3">需重啟的項</h3>
            <div className="rp-list">{restartItems.map(k => <span key={k} className="rp-code">{k}</span>)}</div>
            <span className="rp-label">監聽器、NFQUEUE、TProxy、DNS 綁定在啟動期決定；修改這些項目後 reload 不會生效。</span>
          </div>
        </div>
      </div>
    </div>
  );
}
