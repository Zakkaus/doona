import {useState} from 'react';
import type {GroupSummary} from '../../api/model';
import {useT} from '../../i18n';
import Shuffle from '../../ui/icons/Shuffle';
import Filter from '../../ui/icons/Filter';
import {MenuButton, Segmented, toast} from '../../ui/ui';

export function ModeControls({groups}: {groups: GroupSummary[]}) {
  const t = useT();
  const [mode, setMode] = useState('rule');
  const [chosenTarget, setTarget] = useState('');
  const target = groups.some(g => g.name === chosenTarget) ? chosenTarget : (groups[0]?.name ?? '—');
  return (
    <>
      <div className="rp-card rp-mode-tile">
        <div className="rp-row">
          <span className="rp-qlabel rp-tint-c3">
            <Shuffle />
            {t('act.mode')}
            <span className="rp-badge rp-nav-compat">{t('nav.compat')}</span>
          </span>
          <Segmented
            label={t('act.mode')}
            value={mode}
            onChange={value => {
              setMode(value);
              toast('neutral', t('compat.disconnected'));
            }}
            items={[
              ['rule', t('mode.rule')],
              ['global', t('mode.global')],
              ['direct', t('mode.direct')]
            ]}
          />
        </div>
      </div>
      <div className="rp-card rp-global-tile">
        <div className="rp-row">
          <span className="rp-qlabel rp-tint-c2">
            <Filter />
            {t('act.global')}
            <span className="rp-badge rp-nav-compat">{t('nav.compat')}</span>
          </span>
          <MenuButton
            quiet
            label={t('act.global')}
            value={target}
            onChange={value => {
              setTarget(value);
              toast('neutral', t('compat.disconnected'));
            }}
            items={groups.map(g => ({id: g.name, label: g.name}))}
          >
            {target}
          </MenuButton>
        </div>
      </div>
    </>
  );
}
