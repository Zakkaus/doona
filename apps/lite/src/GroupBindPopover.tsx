import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Popover} from '@astryxdesign/core/Popover';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {Heading, Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {ToggleButton} from '@astryxdesign/core/ToggleButton';
import {useContext, useRef, useState, type ComponentProps} from 'react';
import {compileFilters} from '../../../src/dae/groupFilters';
import {regions} from '../../../src/dae/regions';
import {subscriptionBinding} from './groupBindings';
import {LocaleContext, useMessages} from './i18n';
import {regionLabel, regionOf} from './regions';
import {Add, Edit} from './ui/icons';
import {RowEntrance} from './ui/motion';
import {inspectorStyles} from './GroupInspector';

const split = (text: string) => [
  ...new Set(
    text
      .split(/[,，、]+/)
      .map(word => word.trim())
      .filter(Boolean)
  )
];

// Bind all subscription nodes, or select them by region and name.
export function GroupBindPopover({
  name,
  names,
  initial,
  disabled,
  submit,
  triggerStyle
}: {
  name: string;
  names: string[];
  initial: {regions: string[]; words: string[]} | null;
  disabled: boolean;
  submit: (filter: string) => void;
  triggerStyle?: ComponentProps<typeof IconButton>['xstyle'];
}) {
  const t = useMessages();
  const locale = useContext(LocaleContext);
  const editing = initial !== null;
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null!);
  const [scope, setScope] = useState('all');
  const [text, setText] = useState('');
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
  const reset = () => {
    setScope(initial && (initial.regions.length || initial.words.length) ? 'filtered' : 'all');
    setText((initial?.words ?? []).join(t.listSep));
    setSelectedRegions(new Set(initial?.regions));
  };
  const words = scope === 'all' ? [] : split(text);
  const filter = subscriptionBinding(name, scope === 'all' ? [] : regions.filter(([iso]) => selectedRegions.has(iso)).map(([iso]) => iso), words);
  const matches = open ? compileFilters([filter]) : null;
  const count = matches ? names.filter(node => matches({name: node, subscription_tag: name})).length : 0;
  const missing = scope === 'filtered' && !selectedRegions.size && !words.length;
  const chips = (open ? regions : [])
    .filter(([iso]) => names.some(node => regionOf(node) === iso) || initial?.regions.includes(iso))
    .map(([iso]) => ({iso, label: regionLabel(iso, locale)}));
  const toggle = (iso: string, on: boolean) => {
    setSelectedRegions(current => {
      const next = new Set(current);
      if (on) next.add(iso);
      else next.delete(iso);
      return next;
    });
    setScope('filtered');
  };
  const title = (editing ? t.bindEditTitle : t.bindTitle).replace('{name}', name);
  return (
    <>
      <IconButton
        ref={anchor}
        label={editing ? t.editBinding.replace('{name}', name) : `${t.addMember}: ${name}`}
        data-add-member={editing ? undefined : true}
        data-edit-binding={editing ? name : undefined}
        variant="ghost"
        size="sm"
        isDisabled={disabled}
        icon={<Icon icon={editing ? Edit : Add} size="sm" />}
        xstyle={triggerStyle}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) {
            reset();
            setOpen(true);
          }
        }}
      />
      {open && (
        <Popover
          anchorRef={anchor}
          isOpen={open}
          onOpenChange={value => {
            if (value) reset();
            setOpen(value);
          }}
          label={title}
          width={360}
          padding={4}
          hasCloseButton
          closeButtonLabel={t.close}
          content={
            <VStack gap={4} data-bind-popover={name}>
              <Heading level={3}>{title}</Heading>
              <RowEntrance>
                <RadioList label={t.bindScope} isLabelHidden value={scope} onChange={setScope}>
                  <RadioListItem value="all" label={t.bindAll} />
                  <RadioListItem value="filtered" label={t.bindFiltered} />
                </RadioList>
              </RowEntrance>
              {chips.length > 0 && (
                <HStack gap={2} wrap="wrap" role="group" aria-label={t.region}>
                  {chips.map(chip => {
                    const pressed = selectedRegions.has(chip.iso);
                    return (
                      <ToggleButton
                        key={chip.iso}
                        label={chip.label}
                        size="sm"
                        isPressed={pressed}
                        xstyle={[inspectorStyles.chip, !pressed && inspectorStyles.chipIdle]}
                        onPressedChange={value => toggle(chip.iso, value)}
                      />
                    );
                  })}
                </HStack>
              )}
              <TextInput
                label={t.bindKeywords}
                description={t.bindKeywordsHelp}
                value={text}
                onChange={value => {
                  setText(value);
                  if (value.trim()) setScope('filtered');
                }}
                width="100%"
              />
              <Text role="status" type="supporting" color={missing ? 'secondary' : undefined} hasTabularNumbers>
                {missing ? t.bindNeedsText : (count === 1 ? t.bindCountOne : t.bindCount).replace('{name}', name).replace('{n}', String(count))}
              </Text>
              <HStack gap={2} hAlign="end">
                <Button label={t.cancel} variant="secondary" onClick={() => setOpen(false)} />
                <Button
                  label={editing ? t.save : t.add}
                  variant="primary"
                  isDisabled={disabled || missing}
                  onClick={() => {
                    submit(filter);
                    setOpen(false);
                  }}
                />
              </HStack>
            </VStack>
          }
        />
      )}
    </>
  );
}
