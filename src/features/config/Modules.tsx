import {useMemo} from 'react';
import type {EffectiveConfig} from '../../api/model';
import {engineOf} from '../../api/engines';
import {useT} from '../../i18n';
import {useVersion} from '../../store';
import {Card, Link} from '../../ui/ui';
import {sectionSummaries} from './view';
export function Modules({config}: {config: EffectiveConfig}) {
  const t = useT();
  const version = useVersion().data;
  const engine = useMemo(() => engineOf(version), [version]);
  return (
    <div className="rp-page">
      {sectionSummaries(config.sources, engine, t).map(card => (
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
