import {useState} from 'react';
import Refresh from '@react-spectrum/s2/icons/Refresh';
import {subs, geo} from '../../app/mock';
import {Button, DataTable, Kv, Light, Switch, toast} from '../ui';
import type {PageProps} from './types';

export function Resources(_: PageProps) {
  const [onlyBad, setOnlyBad] = useState(false);
  const shown = onlyBad ? subs.filter(s => !s.ready) : subs;
  const refreshable = subs.filter(s => s.refreshable);
  return (
    <div className="rp-page">
      <div className="rp-between">
        <Switch isSelected={onlyBad} onChange={setOnlyBad}>
          只看未就緒
        </Switch>
        <Button accent onPress={() => toast('negative', '重新整理完成，sub-b 失敗（HTTP 503）')}>
          <Refresh />
          重新整理全部訂閱（{refreshable.length}）
        </Button>
      </div>
      <DataTable
        label="訂閱"
        height={192}
        rows={shown}
        empty="全部就緒"
        cols={[
          {id: 'n', label: '名稱', width: 120, isRowHeader: true},
          {id: 'src', label: '來源'},
          {id: 'st', label: '狀態', width: 130},
          {id: 'try', label: '最後嘗試', width: 110},
          {id: 'ok', label: '最後成功', width: 110},
          {id: 'pub', label: '發布', width: 80},
          {id: 'nodes', label: '節點', width: 72, align: 'end'},
          {id: 'act', label: '重新整理', width: 96}
        ]}
        render={s => [
          s.name,
          <span className="rp-code">{s.source}</span>,
          <Light small tone={s.ready ? 'ok' : 'err'}>
            {s.ready ? '就緒' : s.error || '未就緒'}
          </Light>,
          s.lastTry,
          s.lastOk,
          s.published,
          s.nodes ?? '',
          <Button
            quiet
            icon
            small
            label={s.refreshable ? '重新整理此訂閱' : '本機檔案，外部替換後請手動 reload'}
            isDisabled={!s.refreshable}
            onPress={() =>
              toast(s.ready ? 'positive' : 'negative', s.ready ? s.name + ' 已重新整理，' + s.nodes + ' 個節點' : s.name + ' 重新整理失敗（HTTP 503）')
            }
          >
            <Refresh />
          </Button>
        ]}
      />
      <div className="rp-cards">
        {geo.map(g => (
          <div key={g.name} className="rp-card">
            <div className="rp-between">
              <h3 className="rp-h3">{g.name}</h3>
              <Light tone={g.ready ? 'ok' : 'err'}>就緒</Light>
            </div>
            <Kv items={[['路徑', g.path]]} />
            <Kv
              items={[
                ['大小', g.size],
                ['修改', g.mtime]
              ]}
            />
            <span className="rp-label">唯讀。外部替換檔案後請手動 reload；不提供配額與到期。</span>
          </div>
        ))}
      </div>
    </div>
  );
}
