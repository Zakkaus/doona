import Add from '../../ui/icons/Add';
import LinkIcon from '../../ui/icons/Link';
import {useClients} from '../../api/store';
import {formatBytes} from '../../api/u64';
import {localTime} from '../../api/selectors';
import {Button, DataTable} from '../../ui/ui';
import {RuleDialog} from '../activity/RuleDialog';
import type {PageProps} from '../types';

export function Clients({go}: PageProps) {
  const clients = useClients();
  return (
    <div className="rp-page">
      <p className="rp-note">
        依連線資料的來源位址彙整。API 提供來源、目的位址與域名，不提供 MAC
        或首次見到時間。下載合計僅涵蓋目前可見連線；首次見到由本頁在本次瀏覽器工作階段記錄，不持久保存。
      </p>
      {clients.error && <p role="alert">{clients.error.message}</p>}
      {clients.data?.truncated && <p className="rp-note">連線資料已截斷，合計可能不完整。</p>}
      <DataTable
        label="客戶端"
        height={300}
        empty={clients.loading ? '載入中' : '目前沒有客戶端'}
        rows={clients.rows}
        cols={[
          {id: 'ip', label: '來源 IP', width: 150, isRowHeader: true},
          {id: 'active', label: '活動連線', width: 100, align: 'end'},
          {id: 'download', label: '下載合計', width: 110, align: 'end'},
          {id: 'outbound', label: '出站'},
          {id: 'first', label: '首次見到', width: 190},
          {id: 'act', label: '操作', width: 230}
        ]}
        render={c => [
          <span className="rp-code">{c.ip}</span>,
          c.active,
          formatBytes(c.download),
          c.outbounds || '—',
          <span title={c.firstSeen}>{localTime(c.firstSeen)}</span>,
          <span className="rp-group-btns">
            <Button small onPress={() => go('connections', 'src=' + encodeURIComponent(c.ip))}>
              <LinkIcon />
              連線
            </Button>
            <RuleDialog
              trigger={
                <Button small>
                  <Add />
                  新增規則
                </Button>
              }
              presets={[{label: '來源 ' + c.ip, cond: 'sip(' + c.ip.replace(/^\[|\]$/g, '') + ')'}]}
            />
          </span>
        ]}
      />
    </div>
  );
}
