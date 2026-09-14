import {useState} from 'react';
import {TableView, TableHeader, Column, TableBody, Row, Cell} from '@react-spectrum/s2/TableView';
import {Button} from '@react-spectrum/s2/Button';
import {ButtonGroup} from '@react-spectrum/s2/ButtonGroup';
import {DialogTrigger, AlertDialog} from '@react-spectrum/s2/AlertDialog';
import {style} from '@react-spectrum/s2/style' with {type: 'macro'};
import type {Key, Selection} from '@react-spectrum/s2';
import {page, split, card, code, label, kw, out, h3, col, Kv, toast} from '../ui';
import {rules, fallbackRule, runtime, type Rule} from '../mock';
import {RuleDialog} from '../RuleDialog';
import type {PageProps} from '../Shell';

const fb = style({display: 'flex', alignItems: 'center', gap: 16, font: 'code', paddingX: 16, minHeight: 40, backgroundColor: 'gray-75', borderRadius: 'default'});
export function Rules({go}: PageProps) {
  const [sel, setSel] = useState<Selection>(new Set<Key>(['r4']));
  const cur: Rule | undefined = rules.find(r => sel !== 'all' && sel.has(r.id));
  return (
    <div className={page}>
      <div className={split}>
        <div className={style({display: 'flex', flexDirection: 'column', gap: 8})}>
          <TableView aria-label="規則" selectionMode="single" selectedKeys={sel} onSelectionChange={setSel} styles={style({height: 442})}>
            <TableHeader><Column id="n" width={48}>#</Column><Column id="c" isRowHeader>條件</Column><Column id="o" width={88}>目標</Column><Column id="m" width={80}>must</Column><Column id="s" width={130}>來源</Column><Column id="x" width={80}>注釋</Column></TableHeader>
            <TableBody items={rules}>
              {r => <Row id={r.id}><Cell>{r.n}</Cell><Cell textValue={r.cond}><span className={code}>{r.cond}</span></Cell><Cell>{r.target}</Cell><Cell>{r.must ? 'must' : ''}</Cell><Cell>{r.generated ? '生成' : r.source}</Cell><Cell>{r.note}</Cell></Row>}
            </TableBody>
          </TableView>
          <div className={fb}><span className={kw}>fallback</span>: <span className={out}>{fallbackRule.target}</span><span className={label}>{fallbackRule.source}，在來源編輯器改</span></div>
        </div>
        <div className={card}>
          {cur ? (
            <>
              <h3 className={h3}>#{cur.n} {cur.target}{cur.must ? '(must)' : ''}</h3>
              <span className={code}>{cur.cond}</span>
              <Kv items={[['來源', cur.generated ? '生成，subscription policy' : cur.source], ['狀態', cur.editable ? '可編輯' : '唯讀'], ['修訂', 'r' + runtime.diskRevision]]} />
              <div className={col}>
                <ButtonGroup>
                  <Button variant="secondary" onPress={() => go('config', 'src=' + cur.source.split(':')[0] + '&line=' + cur.source.split(':')[1])} isDisabled={!cur.editable}>打開來源</Button>
                  <DialogTrigger>
                    <Button variant="negative" fillStyle="outline" isDisabled={!cur.editable}>刪除</Button>
                    <AlertDialog variant="destructive" title={'刪除 #' + cur.n} primaryActionLabel="刪除並 reload" cancelLabel="取消" onPrimaryAction={() => toast('positive', '已刪除 #' + cur.n + '，reload 完成（r' + (runtime.diskRevision + 1) + '）')}>
                      從 {cur.source} 刪掉「{cur.cond} -&gt; {cur.target}」，If-Match r{runtime.diskRevision}，校驗通過後 reload。注釋與其他行原樣保留。
                    </AlertDialog>
                  </DialogTrigger>
                </ButtonGroup>
                <RuleDialog trigger={<Button variant="accent">加規則</Button>} presets={[{label: '自訂', cond: 'domain(suffix: example.com)'}]} />
              </div>
            </>
          ) : <span className={label}>選一條規則。</span>}
          <span className={label}>沒有命中計數與重設；複雜條件與 fallback 在來源編輯器改。</span>
        </div>
      </div>
    </div>
  );
}
