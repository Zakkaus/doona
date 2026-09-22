import {useT} from '../../i18n';
import {Button, ErrorMessage, Light, ChoiceMenu, Segmented} from '../../ui/ui';
import Shuffle from '../../ui/icons/Shuffle';
import Filter from '../../ui/icons/Filter';
type ModeCardsModel = {
  mode: string;
  target: string;
  targetText: string;
  writable: boolean;
  dirty: boolean;
  status: string;
  modes: Array<[string, string]>;
  targets: Array<{id: string; label: string}>;
  busy: boolean;
  error: Error | null;
  pick: (mode: string) => void;
  pickTarget: (target: string) => void;
  apply: () => void;
};

export function ModeCards({model: vm}: {model: ModeCardsModel}) {
  const t = useT();
  return (
    <>
      {vm.error && <ErrorMessage error={vm.error} />}
      <div className="rp-card">
        <div className="rp-row">
          <span className="rp-qlabel rp-tint-c3">
            <Shuffle />
            {t('act.mode')}
          </span>
          {!vm.writable ? (
            !vm.error && (
              <Light small tone="muted">
                {vm.status}
              </Light>
            )
          ) : (
            <span className="rp-cluster">
              <Segmented label={t('act.mode')} value={vm.mode} onChange={vm.pick} isDisabled={vm.busy} items={vm.modes} />
              <Button small accent isDisabled={!vm.dirty} isPending={vm.busy} onPress={vm.apply}>
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
          <ChoiceMenu quiet isDisabled={vm.busy || !vm.writable} label={t('act.global')} value={vm.target} onChange={vm.pickTarget} items={vm.targets}>
            {vm.targetText}
          </ChoiceMenu>
        </div>
      </div>
    </>
  );
}
