import {useT} from '../../i18n';
import {Dialog, DialogTrigger, Popover} from 'react-aria-components';
import {Button, ErrorMessage, Light, Link, ChoiceMenu, Segmented} from '../../ui/ui';
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
  error: Error | null;
  retry: () => void;
  pick: (mode: string) => void;
  pickTarget: (target: string) => void;
  apply: () => void;
};

export function ModeCards({model: vm}: {model: ModeCardsModel}) {
  const t = useT();
  return (
    <>
      {vm.error && <ErrorMessage error={vm.error} onRetry={vm.retry} />}
      <div className="rp-card">
        <div className="rp-row">
          <span className="rp-qlabel rp-tint-c3">
            <Shuffle />
            {t('act.mode')}
          </span>
          <span className="rp-cluster">
            <Segmented label={t('act.mode')} value={vm.mode} onChange={vm.pick} isDisabled={vm.busy || !vm.writable} items={vm.modes} />
            {vm.writable ? (
              <Button small accent isDisabled={!vm.dirty || vm.incomplete} isPending={vm.busy} onPress={vm.apply}>
                {t('act.apply')}
              </Button>
            ) : vm.readOnly ? (
              <DialogTrigger>
                <Button small quiet label={t('act.modeWhyReadOnly')}>
                  {vm.status}
                </Button>
                <Popover className="rp-popover" placement="bottom end">
                  <Dialog className="rp-mode-help" aria-label={t('act.modeWhyReadOnly')}>
                    <p>{t('act.modeReadOnlyReason')}</p>
                    <p>{t('act.modeReadOnlyAction')}</p>
                    <Link external appearance="link" href="https://github.com/Zakkaus/doona/blob/main/README.md#install">
                      {t('act.installGuide')}
                    </Link>
                  </Dialog>
                </Popover>
              </DialogTrigger>
            ) : (
              <Light small tone="muted">
                {vm.status}
              </Light>
            )}
          </span>
        </div>
      </div>
      <div className="rp-card">
        <div className="rp-row">
          <span className="rp-qlabel rp-tint-c2">
            <Filter />
            {t('act.global')}
          </span>
          <ChoiceMenu quiet isDisabled={vm.busy || !vm.writable} label={t('act.global')} value={vm.target} onChange={vm.pickTarget} items={vm.targets}>
            {vm.targetText}
          </ChoiceMenu>
        </div>
      </div>
    </>
  );
}
