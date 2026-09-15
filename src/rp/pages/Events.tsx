import {useState} from 'react';
import {clashLog} from '../../app/mock';
import {useEventFeed} from '../../api/store';
import {eventKinds, eventSummary} from '../../api/selectors';
import {DataTable, Frame, LabeledSelect, Light, Line, LogLine, Tabs} from '../ui';

export function Events() {
  const [kind, setKind] = useState('all');
  const feed = useEventFeed();
  const shown = feed.events.filter(event => kind === 'all' || event.event === kind);
  return (
    <div className="rp-page">
      <Tabs
        label="事件與日誌"
        tabs={[
          ['events', '事件'],
          ['clash', 'Clash 日誌']
        ]}
      >
        {id =>
          id === 'events' ? (
            <div className="rp-page">
              <div className="rp-toolbar">
                <LabeledSelect
                  label="種類"
                  side
                  value={kind}
                  onChange={setKind}
                  items={[{id: 'all', label: '所有種類'}, ...eventKinds.map(id => ({id, label: id}))]}
                />
                <Light small tone={feed.connected ? 'ok' : 'warn'}>
                  {feed.available === false ? '不支援事件串流' : feed.connected ? '已連線' : '重新連線中'}
                </Light>
                {feed.cursor && <span className="rp-code">續傳自 {feed.cursor}</span>}
                <span className="rp-label">顯示最近 200 筆事件，新事件在前。</span>
              </div>
              {feed.error && <p role="alert">{feed.error.message}</p>}
              <DataTable
                label="事件"
                height={442}
                rows={shown}
                empty="沒有符合的事件"
                cols={[
                  {id: 't', label: '時間', width: 220},
                  {id: 'k', label: '種類', width: 190},
                  {id: 'm', label: '摘要', isRowHeader: true}
                ]}
                render={event => [<span className="rp-code">{event.data.observed_at}</span>, event.event, eventSummary(event)]}
              />
            </div>
          ) : (
            <Frame title="Clash 日誌，最近 4 條" actions={<span>info 級，跟隨 global.log_level</span>}>
              {clashLog.map((line, i) => (
                <Line key={i} n={i + 1}>
                  <LogLine text={line} />
                </Line>
              ))}
            </Frame>
          )
        }
      </Tabs>
    </div>
  );
}
