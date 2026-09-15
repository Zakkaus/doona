import {useState} from 'react';
import {Tabs, TabList, Tab, TabPanel} from '@react-spectrum/s2/Tabs';
import {TableView, TableHeader, Column, TableBody, Row, Cell} from '@react-spectrum/s2/TableView';
import {Picker, PickerItem} from '@react-spectrum/s2/Picker';
import {StatusLight} from '@react-spectrum/s2/StatusLight';
import {Text} from '@react-spectrum/s2/Text';
import {style} from '@react-spectrum/s2/style' with {type: 'macro'};
import {page, toolbar, code, label, Frame, Line, LogLine} from '../ui';
import {clashLog} from '../mock';
import {useEventFeed} from '../../api/store';
import {eventKinds, eventSummary} from '../../api/selectors';
import type {PageProps} from '../Shell';

const panel = style({paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 24});
export function Events(_: PageProps) {
  const [kind, setKind] = useState('all');
  const feed = useEventFeed();
  const shown = feed.events.filter(event => kind === 'all' || event.event === kind);
  return (
    <div className={page}>
      <Tabs aria-label="事件與日誌">
        <TabList>
          <Tab id="events">事件</Tab>
          <Tab id="clash">Clash 日誌</Tab>
        </TabList>
        <TabPanel id="events">
          <div className={panel}>
            <div className={toolbar}>
              <Picker aria-label="種類" selectedKey={kind} onSelectionChange={key => key != null && setKind(String(key))}>
                {[
                  <PickerItem key="all" id="all">
                    所有種類
                  </PickerItem>,
                  ...eventKinds.map(kind => (
                    <PickerItem key={kind} id={kind}>
                      {kind}
                    </PickerItem>
                  ))
                ]}
              </Picker>
              <StatusLight variant={feed.connected ? 'positive' : 'notice'} size="S">
                <Text>{feed.available === false ? '不支援事件串流' : feed.connected ? '已連線' : '重新連線中'}</Text>
              </StatusLight>
              {feed.cursor && <span className={code}>續傳自 {feed.cursor}</span>}
              <span className={label}>顯示最近 200 筆事件，新事件在前。</span>
            </div>
            {feed.error && <p role="alert">{feed.error.message}</p>}
            <TableView aria-label="事件" styles={style({height: 442})}>
              <TableHeader>
                <Column id="t" width={220}>
                  時間
                </Column>
                <Column id="k" width={190}>
                  種類
                </Column>
                <Column id="m" isRowHeader>
                  摘要
                </Column>
              </TableHeader>
              <TableBody items={shown} renderEmptyState={() => '沒有符合的事件'}>
                {event => (
                  <Row id={event.id}>
                    <Cell>
                      <span className={code}>{event.data.observed_at}</span>
                    </Cell>
                    <Cell>{event.event}</Cell>
                    <Cell>{eventSummary(event)}</Cell>
                  </Row>
                )}
              </TableBody>
            </TableView>
          </div>
        </TabPanel>
        <TabPanel id="clash">
          <div className={panel}>
            <Frame title="Clash 日誌，最近 4 條" actions={<span className={label}>info 級，跟隨 global.log_level</span>}>
              {clashLog.map((line, i) => (
                <Line key={i} n={i + 1}>
                  <LogLine text={line} />
                </Line>
              ))}
            </Frame>
          </div>
        </TabPanel>
      </Tabs>
    </div>
  );
}
