import {useLang, useT} from '../../i18n';
import {docsHref} from '../shared/docs';
import {Button, Card, ErrorMessage, Light, Link, ChoiceMenu, PopoverDialog, Segmented, WidestLabel} from '../../ui/ui';
import {ControlSizeContext} from '../../ui/controlSize';
import Shuffle from '../../ui/icons/Shuffle';
import Filter from '../../ui/icons/Filter';
type ModeCardsModel = {
  mode: string;
  target: string;
  targetText: string;
  writable: boolean;
  dirty: boolean;
  incomplete: boolean;
  status: string;
  readOnly: boolean;
  modes: Array<[string, string]>;
  targets: Array<{id: string; label: string}>;
  busy: boolean;
  reasons: {mode: string | null; global: string | null};
  error: Error | null;
  retry: () => void;
  pick: (mode: string) => void;
  pickTarget: (target: string) => void;
  apply: () => void;
};

export function ModeApply({model: vm}: {model: Pick<ModeCardsModel, 'writable' | 'dirty' | 'incomplete' | 'busy' | 'apply'>}) {
  const t = useT();
  return vm.writable ? (
    <Button accent isDisabled={!vm.dirty || vm.incomplete} isPending={vm.busy} onPress={vm.apply}>
      {t('config.save')}
    </Button>
  ) : null;
}

// The mode choice with its apply action, or why it cannot change: Activity's mode card and the widget panel share it.
export function ModeSwitch({model: vm, fill}: {model: ModeCardsModel; fill?: boolean}) {
  const t = useT();
  const lang = useLang();
  // The segmented control is L, so the apply action or the read-only reason beside it is L too.
  return (
    <ControlSizeContext value="L">
      <span className="rp-cluster">
        <Segmented label={t('act.mode')} value={vm.mode} onChange={vm.pick} isDisabled={vm.busy || !vm.writable} items={vm.modes} fill={fill} />
        {vm.writable ? (
          <ModeApply model={vm} />
        ) : vm.readOnly ? (
          <PopoverDialog
            label={t('act.modeWhyReadOnly')}
            placement="bottom end"
            trigger={
              <Button quiet label={t('act.modeWhyReadOnly')}>
                {vm.status}
              </Button>
            }
          >
            {() => (
              <>
                <p>{t('act.modeReadOnlyReason')}</p>
                <p>{t('act.modeReadOnlyAction')}</p>
                <Link external appearance="link" href={docsHref(lang, 'read-only')}>
                  {t('act.readOnlyDocs')}
                </Link>
              </>
            )}
          </PopoverDialog>
        ) : (
          <Light small tone="muted">
            {vm.status}
          </Light>
        )}
      </span>
    </ControlSizeContext>
  );
}

export function ModeCards({model: vm, part}: {model: ModeCardsModel; part?: 'mode' | 'global'}) {
  const t = useT();
  return (
    <>
      {part !== 'global' && vm.error && <ErrorMessage error={vm.error} onRetry={vm.retry} />}
      {part !== 'global' && (
        <Card
          title={t('act.mode')}
          aria-label={t('act.mode')}
          tile={{icon: <Shuffle />, tint: 3, kind: 'control'}}
          size="L"
          reason={vm.reasons.mode}
          aside={<ModeSwitch model={vm} />}
        />
      )}
      {part !== 'mode' && (
        <Card
          title={t('act.global')}
          tile={{icon: <Filter />, tint: 2, kind: 'control'}}
          size="L"
          reason={vm.reasons.global}
          aside={
            <span className="rp-cluster rp-global-controls">
              <ChoiceMenu
                quiet
                isDisabled={vm.busy || !vm.writable}
                label={t('act.global')}
                value={vm.target}
                onChange={vm.pickTarget}
                items={vm.targets}
                searchLabel={t('ui.filterOutbounds')}
              >
                <WidestLabel labels={vm.targets.map(target => target.label)}>{vm.targetText}</WidestLabel>
              </ChoiceMenu>
              <ModeApply model={vm} />
            </span>
          }
        />
      )}
    </>
  );
}
