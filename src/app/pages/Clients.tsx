import {TableView, TableHeader, Column, TableBody, Row, Cell} from '@react-spectrum/s2/TableView';
import {ActionButton} from '@react-spectrum/s2/ActionButton';
import {ActionButtonGroup} from '@react-spectrum/s2/ActionButtonGroup';
import {Text} from '@react-spectrum/s2/Text';
import {style} from '@react-spectrum/s2/style' with {type: 'macro'};
import Add from '@react-spectrum/s2/icons/Add';
import LinkIcon from '@react-spectrum/s2/icons/Link';
import {page, code, note} from '../ui';
import {useClients} from '../../api/store';
import {formatBytes} from '../../api/u64';
import {localTime} from '../../api/selectors';
import {RuleDialog} from '../RuleDialog';
import type {PageProps} from '../Shell';

export function Clients({go}: PageProps) {
  const clients = useClients();
  return (
    <div className={page}>
      <p className={note}>依連線資料的來源位址彙整。API 提供來源、目的位址與域名，不提供 MAC 或首次見到時間。下載合計僅涵蓋目前可見連線；首次見到由本頁在本次瀏覽器工作階段記錄，不持久保存。</p>
      {clients.error && <p role="alert">{clients.error.message}</p>}
      {clients.data?.truncated && <p className={note}>連線資料已截斷，合計可能不完整。</p>}
      <TableView aria-label="客戶端" styles={style({height: 300})}>
        <TableHeader><Column id="ip" isRowHeader width={150}>來源 IP</Column><Column id="active" width={100}>活動連線</Column><Column id="download" width={110}>下載合計</Column><Column id="outbound">出站</Column><Column id="first" width={190}>首次見到</Column><Column id="act" width={230}>操作</Column></TableHeader>
        <TableBody items={clients.rows} renderEmptyState={() => clients.loading ? '載入中' : '目前沒有客戶端'}>
          {c => <Row id={c.ip}><Cell><span className={code}>{c.ip}</span></Cell><Cell>{c.active}</Cell><Cell>{formatBytes(c.download)}</Cell><Cell>{c.outbounds || '—'}</Cell><Cell><span title={c.firstSeen}>{localTime(c.firstSeen)}</span></Cell><Cell>
            <ActionButtonGroup size="S">
              <ActionButton onPress={() => go('connections', 'src=' + encodeURIComponent(c.ip))}><LinkIcon /><Text>連線</Text></ActionButton>
              <RuleDialog trigger={<ActionButton><Add /><Text>新增規則</Text></ActionButton>} presets={[{label: '來源 ' + c.ip, cond: 'sip(' + c.ip.replace(/^\[|\]$/g, '') + ')'}]} />
            </ActionButtonGroup>
          </Cell></Row>}
        </TableBody>
      </TableView>
    </div>
  );
}
