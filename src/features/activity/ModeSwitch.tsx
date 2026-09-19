import {useState} from 'react';
import {useT} from '../../i18n';
import type {Key} from '../../i18n/messages';
import {useCapabilities, useConfig, useConfigEditor, useGroups} from '../../api/store';
import {candidate} from '../config/names';
import {Button, Light, MenuButton, Segmented, errorText, toast} from '../../ui/ui';
import Shuffle from '../../ui/icons/Shuffle';
import Filter from '../../ui/icons/Filter';
import {readMode, sameMode, writeMode, type OutboundMode} from './mode';

const order = ['rule', 'direct', 'global'] as const;
const modeLabels: Record<(typeof order)[number], Key> = {rule: 'mode.rule', direct: 'mode.direct', global: 'mode.global'};

// The two quick cards: the outbound mode and the outbound global mode sends everything through. Edits are
// staged; Apply writes the main source and reloads, which is the only way an engine without a mode switch
// takes them. Without a writable main source the cards say so.
export function ModeCards() {
  const t = useT();
  const resources = useCapabilities().data?.resources;
  const writable = resources?.config.available === true && resources.config.writable === true && resources.config.content === true;
  const config = useConfig(resources?.config.available === true);
  const groups = useGroups(resources?.groups.available === true);
  const editor = useConfigEditor(config.refetch);
  const main = config.data?.sources.find(source => source.kind === 'main' && source.writable && typeof source.content === 'string');
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
    if (!main || !staged) return;
    let content: string;
    try {
      content = writeMode(main.content!, staged);
    } catch {
      toast('negative', t('act.modeNoRouting'));
      return;
    }
    const check = await editor.validate({sources: [candidate(main, content)], mode: 'full'});
    if (!check) return;
    if (!check.valid) {
      toast('negative', t('act.modeInvalid', {n: String(check.diagnostics.filter(d => d.level === 'error').length)}));
      return;
    }
    const result = await editor.save(main.id, content, main.content_sha256);
    if (result) {
      setStaged(null);
      toast('positive', t('act.modeApplied', {mode: t(modeLabels[staged.mode])}));
    }
  };
  const busy = editor.busy !== null;
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
          <MenuButton
            quiet
            label={t('act.global')}
            value={target}
            onChange={name => setStaged({mode: 'global', target: name})}
            items={list.map(g => ({id: g.name, label: g.name}))}
          >
            {target || '—'}
          </MenuButton>
        </div>
      </div>
    </>
  );
}
