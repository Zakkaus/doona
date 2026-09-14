import {TableView, TableHeader, Column, TableBody, Row, Cell} from '@react-spectrum/s2/TableView';
import {ActionButton} from '@react-spectrum/s2/ActionButton';
import {ActionButtonGroup} from '@react-spectrum/s2/ActionButtonGroup';
import {Text} from '@react-spectrum/s2/Text';
import {style} from '@react-spectrum/s2/style' with {type: 'macro'};
import Add from '@react-spectrum/s2/icons/Add';
import LinkIcon from '@react-spectrum/s2/icons/Link';
import {page, code, note} from '../ui';
import {clients, runtime} from '../mock';
import {RuleDialog} from '../RuleDialog';
import type {PageProps} from '../Shell';

export function Clients({go}: PageProps) {
  return (
    <div className={page}>
      <p className={note}>從可見連線聚合，只列本次觀察（{runtime.window}）裡有連線的來源 IP，不持久；MAC 只在 eBPF 看得到時才有。不做 DHCP 清單、命名與累計流量。</p>
      <TableView aria-label="客戶端" styles={style({height: 242})}>
        <TableHeader><Column id="ip" isRowHeader width={140}>來源 IP</Column><Column id="mac" width={190}>MAC</Column><Column id="active" width={100}>活動連線</Column><Column id="sampled" width={120}>採樣位元組</Column><Column id="first">首次看到</Column><Column id="act" width={210}>操作</Column></TableHeader>
        <TableBody items={clients}>
          {c => <Row id={c.ip}><Cell><span className={code}>{c.ip}</span></Cell><Cell>{c.mac ? <span className={code}>{c.mac}</span> : '未知'}</Cell><Cell>{c.active}</Cell><Cell>{c.sampled}</Cell><Cell>{c.firstSeen}</Cell><Cell>
            <ActionButtonGroup size="S">
              <ActionButton onPress={() => go('connections', 'src=' + c.ip)}><LinkIcon /><Text>連線</Text></ActionButton>
              <RuleDialog trigger={<ActionButton><Add /><Text>加規則</Text></ActionButton>} presets={[{label: '來源 ' + c.ip, cond: 'sip(' + c.ip + ')'}, ...(c.mac ? [{label: 'MAC ' + c.mac, cond: 'mac(' + c.mac + ')'}] : [])]} />
            </ActionButtonGroup>
          </Cell></Row>}
        </TableBody>
      </TableView>
    </div>
  );
}
