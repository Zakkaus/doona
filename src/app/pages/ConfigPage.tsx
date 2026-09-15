import {useState} from 'react';
import {Picker, PickerItem} from '@react-spectrum/s2/Picker';
import {Button} from '@react-spectrum/s2/Button';
import {ButtonGroup} from '@react-spectrum/s2/ButtonGroup';
import {Badge} from '@react-spectrum/s2/Badge';
import {Switch} from '@react-spectrum/s2/Switch';
import {Text} from '@react-spectrum/s2/Text';
import {Heading} from '@react-spectrum/s2/Heading';
import {Content} from '@react-spectrum/s2/Content';
import {InlineAlert} from '@react-spectrum/s2/InlineAlert';
import {TextArea} from '@react-spectrum/s2/TextArea';
import {style} from '@react-spectrum/s2/style' with {type: 'macro'};
import type {Key} from '@react-spectrum/s2';
import {page, split, card, between, row, code, label, list, inline, col, h3, Frame, Line, DaeLine, toast} from '../ui';
import {sources, diagnostics, runtime} from '../mock';
import type {PageProps} from '../Shell';

export function ConfigPage({query, go}: PageProps) {
  const q = new URLSearchParams(query);
  const wanted = sources.find(s => s.path.endsWith(q.get('src') || '#'));
  const [srcId, setSrcId] = useState<Key>(wanted ? wanted.id : 'main');
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState('');
  const [dirty, setDirty] = useState(false);
  const src = sources.find(s => s.id === srcId)!;
  const errs = diagnostics.filter(d => d.source === src.id && d.level === 'error');
  const startEdit = (on: boolean) => { setEdit(on); if (on) setText(src.lines.join('\n')); };
  return (
    <div className={page}>
      <div className={split}>
        <div className={col}>
          <div className={between}>
            <div className={row}>
              <Picker aria-label="來源" selectedKey={srcId} onSelectionChange={k => { if (k != null) { setSrcId(k); setEdit(false); setDirty(false); } }}>{sources.map(s => <PickerItem key={s.id} id={s.id}>{s.path}</PickerItem>)}</Picker>
              <div className={inline}><Badge variant="neutral" fillStyle="outline" size="S"><Text>磁碟 r{runtime.diskRevision}</Text></Badge></div>
              <div className={inline}><Badge variant="neutral" fillStyle="outline" size="S"><Text>執行中 r{runtime.activeRevision}</Text></Badge></div>
              {dirty && <div className={inline}><Badge variant="notice" size="S"><Text>未儲存</Text></Badge></div>}
            </div>
            <ButtonGroup>
              <Button variant="secondary" onPress={() => go('validate')}>{errs.length ? `校驗 (${errs.length})` : '校驗'}</Button>
              <Button variant="primary" onPress={() => toast('neutral', 'reload 完成（r' + runtime.diskRevision + '）')}>reload</Button>
              <Button variant="accent" isDisabled={!dirty} onPress={() => { setDirty(false); toast('positive', '已應用並 reload（r' + (runtime.diskRevision + 1) + '）'); }}>應用並 reload</Button>
            </ButtonGroup>
          </div>
          {errs.map(e => <InlineAlert key={e.line} variant="negative" fillStyle="border"><Heading>第 {e.line} 行：{e.msg.split('；')[0]}</Heading><Content>{e.msg.split('；')[1]}</Content></InlineAlert>)}
          {edit
            ? <TextArea aria-label="來源" value={text} onChange={v => { setText(v); setDirty(true); }} styles={style({width: 'full'})} />
            : <Frame title={src.path} actions={<span className={label}>{src.lines.length} 行，{src.editable ? '可編輯' : '唯讀'}</span>}>{src.lines.map((l, i) => <Line key={i} n={i + 1} err={errs.some(e => e.line === i + 1)}><DaeLine text={l} /></Line>)}</Frame>}
        </div>
        <div className={col}>
          <div className={card}>
            <Switch isSelected={edit} onChange={startEdit} isDisabled={!src.editable}>無損編輯</Switch>
            <span className={label}>唯讀檢視預設遮罩機密（訂閱網址、密碼），遮罩文字永不寫回。開啟編輯才讀取原文（control 權限、no-store）。</span>
          </div>
          <div className={card}>
            <h3 className={h3}>外部改動</h3>
            <span className={label}>應用時用 If-Match r{runtime.diskRevision}；磁碟被別人改過就顯示衝突，不覆蓋。沒有自動 reload 開關。</span>
          </div>
        </div>
      </div>
    </div>
  );
}
