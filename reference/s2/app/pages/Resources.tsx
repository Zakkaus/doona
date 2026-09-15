import {useState} from 'react';
import {TableView, TableHeader, Column, TableBody, Row, Cell} from '@react-spectrum/s2/TableView';
import {Button} from '@react-spectrum/s2/Button';
import {ActionButton} from '@react-spectrum/s2/ActionButton';
import {Switch} from '@react-spectrum/s2/Switch';
import {Text} from '@react-spectrum/s2/Text';
import {TooltipTrigger, Tooltip} from '@react-spectrum/s2/Tooltip';
import {LabeledValue} from '@react-spectrum/s2/LabeledValue';
import {style} from '@react-spectrum/s2/style' with {type: 'macro'};
import Refresh from '@react-spectrum/s2/icons/Refresh';
import {page, between, card, cards, span2, code, label, inline, h3, Kv, Ready, toast} from '../ui';
import {subs, geo} from '../mock';
import type {PageProps} from '../Shell';

export function Resources(_: PageProps) {
  const [onlyBad, setOnlyBad] = useState(false);
  const shown = onlyBad ? subs.filter(s => !s.ready) : subs;
  const refreshable = subs.filter(s => s.refreshable);
  return (
    <div className={page}>
      <div className={between}>
        <Switch isSelected={onlyBad} onChange={setOnlyBad}>
          只看未就緒
        </Switch>
        <Button variant="primary" onPress={() => toast('negative', '刷新完成，sub-b 失敗（HTTP 503）')}>
          <Refresh />
          <Text>刷新全部可刷新的（{refreshable.length}）</Text>
        </Button>
      </div>
      <TableView aria-label="訂閱" styles={style({height: 192})}>
        <TableHeader>
          <Column id="n" isRowHeader width={120}>
            名稱
          </Column>
          <Column id="src">來源</Column>
          <Column id="st" width={120}>
            狀態
          </Column>
          <Column id="try" width={110}>
            最後嘗試
          </Column>
          <Column id="ok" width={110}>
            最後成功
          </Column>
          <Column id="pub" width={80}>
            發布
          </Column>
          <Column id="nodes" width={72}>
            節點
          </Column>
          <Column id="act" width={72}>
            刷新
          </Column>
        </TableHeader>
        <TableBody items={shown} renderEmptyState={() => '全部就緒'}>
          {s => (
            <Row id={s.id}>
              <Cell>{s.name}</Cell>
              <Cell>
                <span className={code}>{s.source}</span>
              </Cell>
              <Cell>
                <Ready ok={s.ready}>{s.ready ? '就緒' : s.error || '未就緒'}</Ready>
              </Cell>
              <Cell>{s.lastTry}</Cell>
              <Cell>{s.lastOk}</Cell>
              <Cell>{s.published}</Cell>
              <Cell>{s.nodes ?? ''}</Cell>
              <Cell>
                <div className={inline}>
                  <TooltipTrigger>
                    <ActionButton
                      isQuiet
                      size="S"
                      aria-label="刷新"
                      isDisabled={!s.refreshable}
                      onPress={() =>
                        toast(s.ready ? 'positive' : 'negative', s.ready ? s.name + ' 已刷新，' + s.nodes + ' 個節點' : s.name + ' 刷新失敗（HTTP 503）')
                      }
                    >
                      <Refresh />
                    </ActionButton>
                    <Tooltip>{s.refreshable ? '刷新這個訂閱' : '本機檔案，外部替換後手動 reload'}</Tooltip>
                  </TooltipTrigger>
                </div>
              </Cell>
            </Row>
          )}
        </TableBody>
      </TableView>
      <div className={cards}>
        {geo.map(g => (
          <div key={g.name} className={card + ' ' + span2}>
            <div className={between}>
              <h3 className={h3}>{g.name}</h3>
              <Ready ok={g.ready}>就緒</Ready>
            </div>
            <LabeledValue label="路徑" value={g.path} />
            <Kv
              items={[
                ['大小', g.size],
                ['修改', g.mtime]
              ]}
            />
            <span className={label}>唯讀。外部替換檔案後手動 reload；不做配額與到期。</span>
          </div>
        ))}
      </div>
    </div>
  );
}
