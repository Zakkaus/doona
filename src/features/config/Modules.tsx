import {useT} from '../../i18n';
import {TextTooltip, Card, Light, Link} from '../../ui/ui';
import {useModules, type ModulesProps} from './useModules';
export function Modules(props: ModulesProps) {
  const t = useT();
  const vm = useModules(props);
  return (
    <div className="rp-page">
      {vm.cards.map(card => (
        <Card key={card.id} aria-label={card.kind}>
          <div className="rp-row">
            <span className="rp-cluster">
              <h2 className="rp-h3 rp-code">{card.kind}</h2>
              <span className="rp-label rp-code">{card.range}</span>
            </span>
            {card.href && (
              <Link appearance="button" href={card.href}>
                {t('config.moduleOpen')}
              </Link>
            )}
          </div>
          {card.nodeLinks.length > 0 && (
            <div className="rp-cluster">
              {card.nodeLinks.map(node => (
                <Link key={node.name} appearance="link" layout="constrained" href={node.href}>
                  <TextTooltip>{t('nodes.edit', {name: node.name})}</TextTooltip>
                </Link>
              ))}
            </div>
          )}
          {card.summary && (
            <Light small tone={card.block ? 'info' : 'muted'}>
              {card.summary}
            </Light>
          )}
          {card.note && (
            <Light small tone="muted">
              {card.note}
            </Light>
          )}
        </Card>
      ))}
    </div>
  );
}
