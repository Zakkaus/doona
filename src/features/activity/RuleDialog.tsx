import {useT} from '../../i18n';
// "Add rule" dialog shared by connections, clients and rules, on the Rosé Pine kit.
import {useState, type ReactElement} from 'react';
import {groups, runtime} from '../clash-compat/fixtures';
import {Button, LabeledSelect, ModalDialog, Switch, TextField, toast} from '../../ui/ui';

export type Preset = {label: string; cond: string};
export function RuleDialog({trigger, presets}: {trigger: ReactElement; presets: Preset[]}) {
  const t = useT();
  const [i, setI] = useState('0');
  const [cond, setCond] = useState(presets[0].cond);
  const [target, setTarget] = useState('direct');
  const [pos, setPos] = useState('before-fallback');
  const [must, setMust] = useState(false);
  const targets = ['direct', 'block', ...groups.map(g => g.name)].map(t => ({id: t, label: t}));
  return (
    <ModalDialog
      trigger={trigger}
      title={t('ui.addRule')}
      narrow
      footer={close => (
        <>
          <Button secondary onPress={close}>
            {t('ui.cancel')}
          </Button>
          <Button
            accent
            onPress={() => {
              close();
              toast('positive', t('ruleDialog.added', {revision: runtime.diskRevision + 1}));
            }}
          >
            {t('ruleDialog.addReload')}
          </Button>
        </>
      )}
    >
      <div className="rp-form">
        {presets.length > 1 && (
          <LabeledSelect
            label={t('ruleDialog.basis')}
            value={i}
            onChange={k => {
              setI(k);
              setCond(presets[Number(k)].cond);
            }}
            items={presets.map((p, j) => ({id: String(j), label: p.label}))}
          />
        )}
        <TextField label={t('ui.rule')} value={cond} onChange={setCond} />
        <LabeledSelect label={t('ui.target')} value={target} onChange={setTarget} items={targets} />
        <LabeledSelect
          label={t('ui.position')}
          value={pos}
          onChange={setPos}
          items={[
            {id: 'before-fallback', label: t('ruleDialog.beforeFallback')},
            {id: 'before-hit', label: t('ruleDialog.beforeHit')},
            {id: 'rules-end', label: t('ruleDialog.rulesEnd')}
          ]}
        />
        <Switch isSelected={must} onChange={setMust}>
          {t('ruleDialog.must')}
        </Switch>
      </div>
    </ModalDialog>
  );
}
