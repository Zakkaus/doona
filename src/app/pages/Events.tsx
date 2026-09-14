import {useState} from 'react';
import {Tabs, TabList, Tab, TabPanel} from '@react-spectrum/s2/Tabs';
import {TableView, TableHeader, Column, TableBody, Row, Cell} from '@react-spectrum/s2/TableView';
import {Picker, PickerItem} from '@react-spectrum/s2/Picker';
import {SegmentedControl, SegmentedControlItem} from '@react-spectrum/s2/SegmentedControl';
import {StatusLight} from '@react-spectrum/s2/StatusLight';
import {ActionButton} from '@react-spectrum/s2/ActionButton';
import {Text} from '@react-spectrum/s2/Text';
import {style} from '@react-spectrum/s2/style' with {type: 'macro'};
import type {Key} from '@react-spectrum/s2';
import OpenIn from '@react-spectrum/s2/icons/OpenIn';
import {page, toolbar, code, inline, label, Frame, Line, LogLine} from '../ui';
import {events, clashLog} from '../mock';
import type {PageProps} from '../Shell';

const LEVEL = {info: 'neutral', warn: 'notice', error: 'negative'} as const;
const panel = style({paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 24});
export function Events({go}: PageProps) {
  const [kind, setKind] = useState<Key>('all');
  const [level, setLevel] = useState<Key>('all');
  const shown = events.filter(e => (kind === 'all' || e.kind === kind) && (level === 'all' || (level === 'warn' ? e.level !== 'info' : e.level === 'error')));
  return (
    <div className={page}>
      <Tabs aria-label="事件與日誌">
        <TabList><Tab id="events">事件</Tab><Tab id="clash">Clash 日誌</Tab></TabList>
        <TabPanel id="events">
          <div className={panel}>
            <div className={toolbar}>
              <Picker aria-label="種類" selectedKey={kind} onSelectionChange={k => k != null && setKind(k)}><PickerItem id="all">所有種類</PickerItem><PickerItem id="reload">reload</PickerItem><PickerItem id="訂閱">訂閱</PickerItem><PickerItem id="探測">探測</PickerItem><PickerItem id="datapath">datapath</PickerItem><PickerItem id="operation">operation</PickerItem></Picker>
              <SegmentedControl aria-label="等級" selectedKey={level} onSelectionChange={setLevel}><SegmentedControlItem id="all">全部</SegmentedControlItem><SegmentedControlItem id="warn">警告以上</SegmentedControlItem><SegmentedControlItem id="error">只看錯誤</SegmentedControlItem></SegmentedControl>
              <span className={label}>重放範圍：行程內最近 200 條，有 gap 會標出；過濾不改 global.log_level。</span>
            </div>
            <TableView aria-label="事件" styles={style({height: 342})}>
              <TableHeader><Column id="t" width={100}>時間</Column><Column id="k" width={110}>種類</Column><Column id="l" width={96}>等級</Column><Column id="m" isRowHeader>訊息</Column><Column id="r" width={96}>引用</Column></TableHeader>
              <TableBody items={shown} renderEmptyState={() => '沒有符合的事件'}>
                {e => <Row id={e.id}><Cell><span className={code}>{e.t}</span></Cell><Cell>{e.kind}</Cell><Cell><StatusLight variant={LEVEL[e.level]} size="S"><Text>{e.level}</Text></StatusLight></Cell><Cell>{e.msg}</Cell><Cell>{e.ref && <div className={inline}><ActionButton isQuiet size="S" onPress={() => go(e.ref!.replace('#/', ''))}><OpenIn /><Text>打開</Text></ActionButton></div>}</Cell></Row>}
              </TableBody>
            </TableView>
          </div>
        </TabPanel>
        <TabPanel id="clash">
          <div className={panel}>
            <Frame title="Clash 日誌，最近 4 條" actions={<span className={label}>info 級，跟隨 global.log_level</span>}>{clashLog.map((l, i) => <Line key={i} n={i + 1}><LogLine text={l} /></Line>)}</Frame>
          </div>
        </TabPanel>
      </Tabs>
    </div>
  );
}
