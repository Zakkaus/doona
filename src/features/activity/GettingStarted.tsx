import {useT, type Key} from '../../i18n';
import {Button, Card, Link, VisuallyHidden} from '../../ui/ui';
import CheckmarkCircle from '../../ui/icons/CheckmarkCircle';
import Clock from '../../ui/icons/Clock';
import Close from '../../ui/icons/Close';
import {href} from '../../shell/route';
import type {useGettingStarted} from './useGettingStarted';

const steps: Array<{id: 'nodes' | 'rules' | 'connection'; title: Key; hint: Key; action: Key; href: string}> = [
  {id: 'nodes', title: 'act.setup.nodes', hint: 'act.setup.nodesHint', action: 'nodes.addProvider', href: href('nodes', {add: 'subscription'})},
  {id: 'rules', title: 'act.setup.rules', hint: 'act.setup.rulesHint', action: 'act.setup.chooseRules', href: href('rules', {template: '1'})},
  {id: 'connection', title: 'act.setup.connection', hint: 'act.setup.connectionHint', action: 'act.setup.checkConnection', href: href('policies')}
];

export function GettingStarted({model: vm}: {model: ReturnType<typeof useGettingStarted>}) {
  const t = useT();
  if (!vm.visible) return null;
  return (
    <Card
      title={t('act.setup.title')}
      aside={
        <Button quiet small icon label={t('act.setup.dismiss')} onPress={vm.dismiss}>
          <Close />
        </Button>
      }
    >
      <div className="rp-setup" role="list">
        {steps.map(step => (
          <div key={step.id} role="listitem" className="rp-setup-step" data-complete={vm.done[step.id]}>
            <span className="rp-setup-status">
              {vm.done[step.id] ? <CheckmarkCircle /> : <Clock />}
              <VisuallyHidden>{t(vm.done[step.id] ? 'act.setup.complete' : 'act.setup.incomplete')}</VisuallyHidden>
            </span>
            <div className="rp-setup-copy">
              <span>{t(step.title)}</span>
              <span className="rp-note">{t(step.hint)}</span>
            </div>
            {!vm.done[step.id] && (
              <Link appearance="button" small href={step.href}>
                {t(step.action)}
              </Link>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
