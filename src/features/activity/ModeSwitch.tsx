import {useState} from 'react';
import {useT} from '../../i18n';
import type {Key} from '../../i18n/messages';
import {useCapabilities, useGroups} from '../../api/store';
import {useMainSourceEdit} from '../config/mainSource';
import {Button, Light, ChoiceMenu, Segmented, errorText, toast} from '../../ui/ui';
import Shuffle from '../../ui/icons/Shuffle';
import Filter from '../../ui/icons/Filter';
import {readMode, sameMode, writeMode, type OutboundMode} from './mode';

const order = ['rule', 'direct', 'global'] as const;
const modeLabels: Record<(typeof order)[number], Key> = {rule: 'mode.rule', direct: 'mode.direct', global: 'mode.global'};

// Stage mode changes until Apply rewrites the main source and reloads. Disable the cards without a writable main source.
export function ModeCards() {
  const t = useT();
  const resources = useCapabilities().data?.resources;
  const groups = useGroups(resources?.groups.available === true);
  const {main, writable, busy, apply: write} = useMainSourceEdit();
  const current: OutboundMode = main ? readMode(main.content!) : {mode: 'rule'};
  const [staged, setStaged] = useState<OutboundMode | null>(null);
  const shown = staged ?? current;
  // Routing names outbounds, so the target is a group name, not its id.
  const list = groups.data ?? [];
  const target = shown.mode === 'global' ? shown.target : ((current.mode === 'global' ? current.target : list[0]?.name) ?? '');
  const dirty = staged !== null && !sameMode(staged, current);
  const pick = (mode: string) => {
    if (mode === 'global') setStaged({mode: 'global', target});
    else if (mode === 'direct' || mode === 'rule') setStaged({mode});
  };
  const apply = async () => {
    if (!staged) return;
    const submitted = staged;
    let written: boolean;
    try {
      written = await write(
        text => writeMode(text, submitted),
        errors => toast('negative', t('act.modeInvalid', {n: String(errors)}))
      );
    } catch (error) {
      toast('negative', errorText(error));
      return;
    }
    if (written) {
      setStaged(current => (current === submitted ? null : current));
      toast('positive', t('act.modeApplied', {mode: t(modeLabels[submitted.mode])}));
    }
  };
  return (
    <>
      <div className="rp-card">
        <div className="rp-row">
          <span className="rp-qlabel rp-tint-c3">
            <Shuffle />
            {t('act.mode')}
          </span>
          {!writable || !main ? (
            <Light small tone="muted">
              {t(resources?.config.available ? 'act.modeNeedsWrite' : 'act.modeUnavailable')}
            </Light>
          ) : (
            <span className="rp-cluster">
              <Segmented label={t('act.mode')} value={shown.mode} onChange={pick} isDisabled={busy} items={order.map(mode => [mode, t(modeLabels[mode])])} />
              {/* Always in place; greyed out until a change is staged, so the row never reflows. */}
              <Button
                small
                accent
                isDisabled={!dirty}
                isPending={busy}
                onPress={() => void apply().catch((error: unknown) => toast('negative', errorText(error)))}
              >
                {t('act.apply')}
              </Button>
            </span>
          )}
        </div>
      </div>
      <div className="rp-card">
        <div className="rp-row">
          <span className="rp-qlabel rp-tint-c2">
            <Filter />
            {t('act.global')}
          </span>
          <ChoiceMenu
            quiet
            isDisabled={busy || !writable || !main}
            label={t('act.global')}
            value={target}
            onChange={name => setStaged({mode: 'global', target: name})}
            items={list.map(g => ({id: g.name, label: g.name}))}
          >
            {target || '—'}
          </ChoiceMenu>
        </div>
      </div>
    </>
  );
}
