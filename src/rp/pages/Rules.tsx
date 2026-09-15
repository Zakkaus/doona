import {useState} from 'react';
import {rules, fallbackRule, runtime, type Rule} from '../../app/mock';
import {Button, DataTable, Kv, ModalDialog, toast} from '../ui';
import {RuleDialog} from '../RuleDialog';
import type {PageProps} from './types';

export function Rules({go}: PageProps) {
  const [sel, setSel] = useState<string | null>('r4');
  const cur: Rule | undefined = rules.find(r => r.id === sel);
  return (
    <div className="rp-page">
      <div className="rp-split">
        <div className="rp-list">
          <DataTable label="規則" rows={rules} selected={sel} onSelect={setSel}
            cols={[{id: 'n', label: '#', width: 56, align: 'end'}, {id: 'c', label: '條件', isRowHeader: true}, {id: 'o', label: '目標', width: 88}, {id: 'm', label: 'must', width: 80}, {id: 's', label: '來源', width: 130}, {id: 'x', label: '注釋', width: 80}]}
            render={r => [r.n, <span className="rp-code">{r.cond}</span>, r.target, r.must ? 'must' : '', r.generated ? '生成' : r.source, r.note]} />
          <div className="rp-fb"><span className="rp-kw">fallback</span>: <span className="rp-out">{fallbackRule.target}</span><span className="rp-label">{fallbackRule.source}，請在來源編輯器修改</span></div>
        </div>
        <div className="rp-card">
          {cur ? (
            <>
              <h3 className="rp-h3">#{cur.n} {cur.target}{cur.must ? '(must)' : ''}</h3>
              <span className="rp-code">{cur.cond}</span>
              <Kv items={[['來源', cur.generated ? '生成，subscription policy' : cur.source], ['狀態', cur.editable ? '可編輯' : '唯讀'], ['修訂', 'r' + runtime.diskRevision]]} />
              <div className="rp-col">
                <div className="rp-group-btns">
                  <Button onPress={() => go('config', 'src=' + cur.source.split(':')[0] + '&line=' + cur.source.split(':')[1])} isDisabled={!cur.editable} secondary>開啟來源</Button>
                  <ModalDialog alert trigger={<Button negative isDisabled={!cur.editable}>刪除</Button>} title={'刪除規則 #' + cur.n} narrow footer={close => <><Button secondary onPress={close}>取消</Button><Button negative onPress={() => { close(); toast('positive', '已刪除 #' + cur.n + '，reload 完成（r' + (runtime.diskRevision + 1) + '）'); }}>刪除並 reload</Button></>}>
                    <p className="rp-note">從 {cur.source} 刪除「{cur.cond} -&gt; {cur.target}」，以 If-Match r{runtime.diskRevision} 寫入，校驗通過後 reload。注釋與其他行原樣保留。</p>
                  </ModalDialog>
                </div>
                <RuleDialog trigger={<Button accent>新增規則</Button>} presets={[{label: '自訂', cond: 'domain(suffix: example.com)'}]} />
              </div>
            </>
          ) : <span className="rp-label">選一條規則。</span>}
          <span className="rp-label">沒有命中計數與重設；複雜條件與 fallback 請在來源編輯器修改。</span>
        </div>
      </div>
    </div>
  );
}
