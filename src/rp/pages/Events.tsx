import {useState} from 'react';
import OpenIn from '@react-spectrum/s2/icons/OpenIn';
import {events, clashLog} from '../../app/mock';
import {useT} from '../../app/i18n';
import {Button, DataTable, Frame, LabeledSelect, Light, Line, LogLine, Segmented, Tabs} from '../ui';
import type {PageProps} from './types';

const TONE = {info: 'info', warn: 'warn', error: 'err'} as const;
export function Events({go}: PageProps) {
  const t = useT();
  const [kind, setKind] = useState('all');
  const [level, setLevel] = useState('all');
  const shown = events.filter(e => (kind === 'all' || e.kind === kind) && (level === 'all' || (level === 'warn' ? e.level !== 'info' : e.level === 'error')));
  return (
    <div className="rp-page">
      <Tabs tabs={[['events', '事件'], ['clash', 'Clash 日誌']]}>{id => id === 'events' ? (
        <div className="rp-page">
          <div className="rp-toolbar">
            <LabeledSelect label="種類" side value={kind} onChange={setKind} items={[{id: 'all', label: '所有種類'}, {id: 'reload', label: 'reload'}, {id: '訂閱', label: '訂閱'}, {id: '探測', label: '探測'}, {id: 'datapath', label: 'datapath'}, {id: 'operation', label: 'operation'}]} />
            <Segmented label="等級" value={level} onChange={setLevel} items={[['all', '全部'], ['warn', '警告以上'], ['error', '只看錯誤']]} />
            <span className="rp-label">重放範圍：行程內最近 200 條，有 gap 會標出；過濾不改 global.log_level。</span>
          </div>
          <DataTable label="事件" height={342} rows={shown} empty="沒有符合的事件"
            cols={[{id: 't', label: '時間', width: 100}, {id: 'k', label: '種類', width: 110}, {id: 'l', label: '等級', width: 96}, {id: 'm', label: '訊息', isRowHeader: true}, {id: 'r', label: '引用', width: 96}]}
            render={e => [<span className="rp-code">{e.t}</span>, e.kind, <Light tone={TONE[e.level]}>{e.level}</Light>, t(`ev.${e.id}` as 'ev.e1'), e.ref ? <Button quiet small onPress={() => go(e.ref!.replace('#/', ''))}><OpenIn />打開</Button> : '']} />
        </div>
      ) : (
        <Frame title="Clash 日誌，最近 4 條" actions={<span>info 級，跟隨 global.log_level</span>}>{clashLog.map((l, i) => <Line key={i} n={i + 1}><LogLine text={l} /></Line>)}</Frame>
      )}</Tabs>
    </div>
  );
}
