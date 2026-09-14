// "Add rule" dialog shared by connections, clients and rules. Prefills the honk condition; the position picker decides the source anchor.
import {useState, type ReactElement} from 'react';
import {DialogTrigger, Dialog} from '@react-spectrum/s2/Dialog';
import {Heading} from '@react-spectrum/s2/Heading';
import {Content} from '@react-spectrum/s2/Content';
import {Form} from '@react-spectrum/s2/Form';
import {TextField} from '@react-spectrum/s2/TextField';
import {Picker, PickerItem} from '@react-spectrum/s2/Picker';
import {Switch} from '@react-spectrum/s2/Switch';
import {Button} from '@react-spectrum/s2/Button';
import {ButtonGroup} from '@react-spectrum/s2/ButtonGroup';
import {groups, runtime} from './mock';
import {toast} from './ui';

export type Preset = {label: string, cond: string};
export function RuleDialog({trigger, presets}: {trigger: ReactElement, presets: Preset[]}) {
  const [i, setI] = useState(0);
  const [cond, setCond] = useState(presets[0].cond);
  const [target, setTarget] = useState('direct');
  const [must, setMust] = useState(false);
  const targets = ['direct', 'block', ...groups.map(g => g.name)];
  return (
    <DialogTrigger>
      {trigger}
      <Dialog>
        {({close}) => (
          <>
            <Heading slot="title">加規則</Heading>
            <Content>
              <Form>
                {presets.length > 1 && <Picker label="依據" selectedKey={String(i)} onSelectionChange={k => { setI(Number(k)); setCond(presets[Number(k)].cond); }}>{presets.map((p, j) => <PickerItem key={j} id={String(j)}>{p.label}</PickerItem>)}</Picker>}
                <TextField label="規則" value={cond} onChange={setCond} />
                <Picker label="目標" selectedKey={target} onSelectionChange={k => setTarget(String(k))}>{targets.map(t => <PickerItem key={t} id={t}>{t}</PickerItem>)}</Picker>
                <Picker label="位置" defaultSelectedKey="before-fallback"><PickerItem id="before-fallback">fallback 之前（config.dae:44）</PickerItem><PickerItem id="before-hit">命中的規則之前</PickerItem><PickerItem id="rules-end">rules.dae 結尾</PickerItem></Picker>
                <Switch isSelected={must} onChange={setMust}>must，全域與直連模式下仍然生效</Switch>
              </Form>
            </Content>
            <ButtonGroup>
              <Button variant="secondary" onPress={close}>取消</Button>
              <Button variant="accent" onPress={() => { close(); toast('positive', '已加入規則，reload 完成（r' + (runtime.diskRevision + 1) + '）'); }}>加入並 reload</Button>
            </ButtonGroup>
          </>
        )}
      </Dialog>
    </DialogTrigger>
  );
}
