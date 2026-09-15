import {useState} from 'react';
import {sources, diagnostics, runtime} from '../../app/mock';
import {Badge, Button, DaeLine, Frame, LabeledSelect, Line, Switch, TextArea, toast} from '../ui';
import type {PageProps} from './types';

export function ConfigPage({query, go}: PageProps) {
  const q = new URLSearchParams(query);
  const wanted = sources.find(s => s.path.endsWith(q.get('src') || '#'));
  const [srcId, setSrcId] = useState(wanted ? wanted.id : 'main');
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState('');
  const [dirty, setDirty] = useState(false);
  const src = sources.find(s => s.id === srcId)!;
  const errs = diagnostics.filter(d => d.source === src.id && d.level === 'error');
  const startEdit = (on: boolean) => { setEdit(on); if (on) setText(src.lines.join('\n')); };
  return (
    <div className="rp-page">
      <div className="rp-split">
        <div className="rp-col">
          <div className="rp-between">
            <div className="rp-cluster">
              <LabeledSelect label="來源" side value={srcId} onChange={k => { setSrcId(k); setEdit(false); setDirty(false); }} items={sources.map(s => ({id: s.id, label: s.path}))} />
              <Badge>磁碟 r{runtime.diskRevision}</Badge>
              <Badge>執行中 r{runtime.activeRevision}</Badge>
              {dirty && <Badge tone="warn">未儲存</Badge>}
            </div>
            <div className="rp-group-btns">
              <Button secondary onPress={() => go('validate')}>校驗{errs.length ? `（${errs.length}）` : ''}</Button>
              <Button primary onPress={() => toast('neutral', 'reload 完成（r' + runtime.diskRevision + '）')}>reload</Button>
              <Button accent isDisabled={!dirty} onPress={() => { setDirty(false); toast('positive', '已應用並 reload（r' + (runtime.diskRevision + 1) + '）'); }}>應用並 reload</Button>
            </div>
          </div>
          {errs.map(e => <div key={e.line} className="rp-alert"><span className="h">第 {e.line} 行：{e.msg.split('；')[0]}</span><span className="b">{e.msg.split('；')[1]}</span></div>)}
          {edit
            ? <TextArea label="來源" value={text} onChange={v => { setText(v); setDirty(true); }} />
            : <Frame title={src.path} actions={<span>{src.lines.length} 行，{src.editable ? '可編輯' : '唯讀'}</span>}>{src.lines.map((l, i) => <Line key={i} n={i + 1} err={errs.some(e => e.line === i + 1)}><DaeLine text={l} /></Line>)}</Frame>}
        </div>
        <div className="rp-col">
          <div className="rp-card">
            <Switch isSelected={edit} onChange={startEdit} isDisabled={!src.editable}>無損編輯</Switch>
            <span className="rp-label">唯讀檢視預設遮罩機密（訂閱網址、密碼），遮罩文字永不寫回。只有啟用編輯時才會讀取原文（control 權限、no-store）。</span>
          </div>
          <div className="rp-card">
            <h3 className="rp-h3">外部改動</h3>
            <span className="rp-label">套用時使用 If-Match r{runtime.diskRevision}；若磁碟已被其他程序修改則顯示衝突，不覆蓋。不提供自動 reload。</span>
          </div>
        </div>
      </div>
    </div>
  );
}
