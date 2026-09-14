import Add from '@react-spectrum/s2/icons/Add';
import LinkIcon from '@react-spectrum/s2/icons/Link';
import {clients, runtime} from '../../app/mock';
import {Button, DataTable} from '../ui';
import {RuleDialog} from '../RuleDialog';
import type {PageProps} from './types';

export function Clients({go}: PageProps) {
  return (
    <div className="rp-page">
      <p className="rp-note">由可見連線彙整，只列出本次觀察（{runtime.window}）內有連線的來源 IP，不持久化；MAC 僅在 eBPF 可見時提供。不提供 DHCP 清單、命名與累計流量。</p>
      <DataTable label="客戶端" height={244} empty="目前沒有客戶端" rows={clients.map(c => ({...c, id: c.ip}))}
        cols={[{id: 'ip', label: '來源 IP', width: 140, isRowHeader: true}, {id: 'mac', label: 'MAC', width: 190}, {id: 'active', label: '活動連線', width: 100, align: 'end'}, {id: 'sampled', label: '採樣位元組', width: 120, align: 'end'}, {id: 'first', label: '首次出現'}, {id: 'act', label: '操作', width: 230}]}
        render={c => [<span className="rp-code">{c.ip}</span>, c.mac ? <span className="rp-code">{c.mac}</span> : '未知', c.active, c.sampled, c.firstSeen,
          <span className="rp-group-btns"><Button small onPress={() => go('connections', 'src=' + c.ip)}><LinkIcon />連線</Button><RuleDialog trigger={<Button small><Add />新增規則</Button>} presets={[{label: '來源 ' + c.ip, cond: 'sip(' + c.ip + ')'}, ...(c.mac ? [{label: 'MAC ' + c.mac, cond: 'mac(' + c.mac + ')'}] : [])]} /></span>]} />
    </div>
  );
}
