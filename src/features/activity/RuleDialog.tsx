// "Add rule" dialog shared by connections, clients and rules, on the Rosé Pine kit.
import {useState, type ReactElement} from 'react';
import {groups, runtime} from '../clash-compat/fixtures';
import {Button, LabeledSelect, ModalDialog, Switch, TextField, toast} from '../../ui/ui';

export type Preset = {label: string; cond: string};
export function RuleDialog({trigger, presets}: {trigger: ReactElement; presets: Preset[]}) {
  const [i, setI] = useState('0');
  const [cond, setCond] = useState(presets[0].cond);
  const [target, setTarget] = useState('direct');
  const [pos, setPos] = useState('before-fallback');
  const [must, setMust] = useState(false);
  const targets = ['direct', 'block', ...groups.map(g => g.name)].map(t => ({id: t, label: t}));
  return (
    <ModalDialog
      trigger={trigger}
      title="新增規則"
      narrow
      footer={close => (
        <>
          <Button secondary onPress={close}>
            取消
          </Button>
          <Button
            accent
            onPress={() => {
              close();
              toast('positive', '已新增規則，reload 完成（r' + (runtime.diskRevision + 1) + '）');
            }}
          >
            新增並 reload
          </Button>
        </>
      )}
    >
      <div className="rp-form">
        {presets.length > 1 && (
          <LabeledSelect
            label="依據"
            value={i}
            onChange={k => {
              setI(k);
              setCond(presets[Number(k)].cond);
            }}
            items={presets.map((p, j) => ({id: String(j), label: p.label}))}
          />
        )}
        <TextField label="規則" value={cond} onChange={setCond} />
        <LabeledSelect label="目標" value={target} onChange={setTarget} items={targets} />
        <LabeledSelect
          label="位置"
          value={pos}
          onChange={setPos}
          items={[
            {id: 'before-fallback', label: 'fallback 之前（config.dae:44）'},
            {id: 'before-hit', label: '命中的規則之前'},
            {id: 'rules-end', label: 'rules.dae 結尾'}
          ]}
        />
        <Switch isSelected={must} onChange={setMust}>
          must，全域與直連模式下仍然生效
        </Switch>
      </div>
    </ModalDialog>
  );
}
