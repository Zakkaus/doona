import {useEffect, useRef} from 'react';
import {useLang, useT} from '../../i18n';
import {docsHref} from '../shared/docs';
import {Button, Card, ErrorMessage, Light, Link, ChoiceMenu, PopoverDialog, Segmented} from '../../ui/ui';
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

export function ModeCards({model: vm, query}: {model: ModeCardsModel; query: string}) {
  const t = useT();
  const lang = useLang();
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    if (new URLSearchParams(query).get('card') === 'mode') card.current?.focus();
  }, [query]);
  return (
    <>
      {vm.error && <ErrorMessage error={vm.error} onRetry={vm.retry} />}
      <Card
        title={t('act.mode')}
        id="activity-mode"
        aria-label={t('act.mode')}
        ref={card}
        tabIndex={-1}
        tile={{icon: <Shuffle />, tint: 3, kind: 'control'}}
        reason={vm.reasons.mode}
        aside={
          <span className="rp-cluster">
            <Segmented label={t('act.mode')} value={vm.mode} onChange={vm.pick} isDisabled={vm.busy || !vm.writable} items={vm.modes} />
            {vm.writable ? (
              <Button small accent isDisabled={!vm.dirty || vm.incomplete} isPending={vm.busy} onPress={vm.apply}>
                {t('config.save')}
              </Button>
            ) : vm.readOnly ? (
              <PopoverDialog
                label={t('act.modeWhyReadOnly')}
                placement="bottom end"
                trigger={
                  <Button small quiet label={t('act.modeWhyReadOnly')}>
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
        }
      />
      <Card
        title={t('act.global')}
        tile={{icon: <Filter />, tint: 2, kind: 'control'}}
        reason={vm.reasons.global}
        aside={
          <ChoiceMenu
            quiet
            isDisabled={vm.busy || !vm.writable}
            label={t('act.global')}
            value={vm.target}
            onChange={vm.pickTarget}
            items={vm.targets}
            searchLabel={t('ui.filterOutbounds')}
          >
            {vm.targetText}
          </ChoiceMenu>
        }
      />
    </>
  );
}
