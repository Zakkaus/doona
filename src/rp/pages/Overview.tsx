import {useState} from 'react';
import Refresh from '@react-spectrum/s2/icons/Refresh';
import FileText from '@react-spectrum/s2/icons/FileText';
import OpenIn from '@react-spectrum/s2/icons/OpenIn';
import {checks} from '../../app/mock';
import {useT} from '../../app/i18n';
import {Badge, Button, Kv, Light, Switch, toast} from '../ui';
import type {Go} from './types';

export function Overview({go}: {go: Go}) {
  const t = useT();
  const [onlyBad, setOnlyBad] = useState(false);
  const shown = onlyBad ? checks.filter(c => !c.ready) : checks;
  return (
    <div className="rp-page">
      <div className="rp-between">
        <Kv inline items={[['上次診斷', 'op-1183，13:40，7 項，2 項失敗'], ['需重啟', '1 項']]} />
        <div className="rp-cluster">
          <Switch isSelected={onlyBad} onChange={setOnlyBad}>只看未就緒</Switch>
          <Button primary onPress={() => toast('info', '診斷 op-1184 已排程')}><Refresh />重新執行診斷</Button>
        </div>
      </div>
      <p className="rp-note">每項列出設定值、實際值與就緒狀態。監聽器、NFQUEUE、TProxy、DNS 綁定在啟動期決定，修改後必須重新啟動；此頁不提供切換，也不會自動修復。</p>
      <div className="rp-list">
        {shown.map(c => (
          <div key={c.id} className="rp-card">
            <div className="rp-check">
              <h3 className="rp-h3">{t(`check.${c.id}` as 'check.ebpf')}</h3>
              <div className="rp-pair"><Kv items={[['設定', c.requested]]} /><Kv items={[['實際', c.effective]]} /></div>
              <div className="rp-cluster">{c.restart && <Badge tone="warn">需重啟</Badge>}<Light small tone={c.ready ? 'ok' : 'err'}>{c.ready ? '就緒' : '未就緒'}</Light></div>
            </div>
            {c.ready ? <span className="rp-label">{c.detail}</span> : (
              <div className="rp-fail">
                <span>{c.detail}</span>
                {c.fix && <span className="rp-label">處理：{c.fix}</span>}
                <div className="rp-group-btns">
                  <Button quiet small onPress={() => toast('info', c.name + ' 檢查已排程')}><Refresh />重新檢查</Button>
                  <Button quiet small onPress={() => go('config', 'key=' + c.id)}><FileText />配置項</Button>
                  {c.manual && <Button quiet small onPress={() => window.open(c.manual, '_blank')}><OpenIn />手冊</Button>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
