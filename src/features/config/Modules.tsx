import {useT} from '../../i18n';
import {Card, Link} from '../../ui/ui';
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
          <span className="rp-label">{card.note ?? card.summary}</span>
        </Card>
      ))}
    </div>
  );
}
