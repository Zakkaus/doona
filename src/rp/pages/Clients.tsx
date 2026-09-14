import Add from '@react-spectrum/s2/icons/Add';
import LinkIcon from '@react-spectrum/s2/icons/Link';
import {clients, runtime} from '../../app/mock';
import {Button, DataTable} from '../ui';
import {RuleDialog} from '../RuleDialog';
import type {PageProps} from './types';

export function Clients({go}: PageProps) {
  return (
    <div className="rp-page">
      <p className="rp-note">從可見連線聚合，只列本次觀察（{runtime.window}）裡有連線的來源 IP，不持久；MAC 只在 eBPF 看得到時才有。不做 DHCP 清單、命名與累計流量。</p>
      <DataTable label="客戶端" height={244} rows={clients.map(c => ({...c, id: c.ip}))}
        cols={[{id: 'ip', label: '來源 IP', width: 140, isRowHeader: true}, {id: 'mac', label: 'MAC', width: 190}, {id: 'active', label: '活動連線', width: 100}, {id: 'sampled', label: '採樣位元組', width: 120}, {id: 'first', label: '首次看到'}, {id: 'act', label: '操作', width: 220}]}
        render={c => [<span className="rp-code">{c.ip}</span>, c.mac ? <span className="rp-code">{c.mac}</span> : '未知', c.active, c.sampled, c.firstSeen,
          <span className="rp-group-btns"><Button small onPress={() => go('connections', 'src=' + c.ip)}><LinkIcon />連線</Button><RuleDialog trigger={<Button small><Add />加規則</Button>} presets={[{label: '來源 ' + c.ip, cond: 'sip(' + c.ip + ')'}, ...(c.mac ? [{label: 'MAC ' + c.mac, cond: 'mac(' + c.mac + ')'}] : [])]} /></span>]} />
    </div>
  );
}
