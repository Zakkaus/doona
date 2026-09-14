import {useState} from 'react';
import {Button} from '@react-spectrum/s2/Button';
import {ActionButton} from '@react-spectrum/s2/ActionButton';
import {ActionButtonGroup} from '@react-spectrum/s2/ActionButtonGroup';
import {Badge} from '@react-spectrum/s2/Badge';
import {Text} from '@react-spectrum/s2/Text';
import {Switch} from '@react-spectrum/s2/Switch';
import {LabeledValue} from '@react-spectrum/s2/LabeledValue';
import {style} from '@react-spectrum/s2/style' with {type: 'macro'};
import Refresh from '@react-spectrum/s2/icons/Refresh';
import FileText from '@react-spectrum/s2/icons/FileText';
import OpenIn from '@react-spectrum/s2/icons/OpenIn';
import {page, between, card, label, list, inline, note, row, h3, Ready, toast} from '../ui';
import {checks} from '../mock';
import {useT} from '../i18n';
import type {PageProps} from '../Shell';

const line = style({display: 'grid', gridTemplateColumns: {default: ['1fr'], lg: [200, 'minmax(0, 1fr)', 'auto']}, alignItems: 'center', gap: 16});
const pair = style({display: 'grid', gridTemplateColumns: ['minmax(0, 1fr)', 'minmax(0, 1fr)'], gap: 16});
const fail = style({display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 16, borderWidth: 0, borderTopWidth: 1, borderStyle: 'solid', borderColor: 'gray-300'});
export function Overview({go}: PageProps) {
  const t = useT();
  const [onlyBad, setOnlyBad] = useState(false);
  const shown = onlyBad ? checks.filter(c => !c.ready) : checks;
  return (
    <div className={page}>
      <div className={between}>
        <div className={row}><LabeledValue label="上次診斷" value="op-1183，13:40，7 項，2 項失敗" /><LabeledValue label="需重啟" value="1 項" /></div>
        <div className={row}>
          <Switch isSelected={onlyBad} onChange={setOnlyBad}>只看未就緒</Switch>
          <Button variant="primary" onPress={() => toast('info', '診斷 op-1184 已排程')}><Refresh /><Text>重新執行診斷</Text></Button>
        </div>
      </div>
      <p className={note}>每項列出設定值、實際值與就緒狀態。監聽器、NFQUEUE、TProxy、DNS 綁定在啟動期決定，改了要重啟；這裡不做開關，也不自動修復。</p>
      <div className={list}>
        {shown.map(c => (
          <div key={c.id} className={card}>
            <div className={line}>
              <h3 className={h3}>{t(`check.${c.id}` as 'check.ebpf')}</h3>
              <div className={pair}><LabeledValue label="設定" value={c.requested} /><LabeledValue label="實際" value={c.effective} /></div>
              <div className={row}>
                {c.restart && <div className={inline}><Badge variant="notice" size="S"><Text>需重啟</Text></Badge></div>}
                <Ready ok={c.ready}>{c.ready ? '就緒' : '未就緒'}</Ready>
              </div>
            </div>
            {c.ready ? <span className={label}>{c.detail}</span> : (
              <div className={fail}>
                <span>{c.detail}</span>
                {c.fix && <span className={label}>處理：{c.fix}</span>}
                <ActionButtonGroup size="S">
                  <ActionButton onPress={() => toast('info', c.name + ' 檢查已排程')}><Refresh /><Text>重新檢查</Text></ActionButton>
                  <ActionButton onPress={() => go('config', 'key=' + c.id)}><FileText /><Text>配置項</Text></ActionButton>
                  {c.manual && <ActionButton onPress={() => window.open(c.manual, '_blank')}><OpenIn /><Text>手冊</Text></ActionButton>}
                </ActionButtonGroup>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
