import {describeFilters} from '../../dae/groups';
import {useT} from '../../i18n';
import {Tag, Tags} from '../../ui/ui';
import {DaeCode} from '../../ui/DaeCode';

export function FilterSummary({filters, showRules = true}: {filters: string[]; showRules?: boolean}) {
  const t = useT();
  const description = describeFilters(filters);
  return (
    <>
      {!filters.length && <p className="rp-note">{t('arrange.holdsAll')}</p>}
      {description.groups.length > 0 && (
        <Tags label={t('arrange.nestedGroups')}>
          <span className="rp-label rp-tags-title">{t('arrange.nestedGroups')}</span>
          {description.groups.map(name => (
            <Tag key={name}>{name}</Tag>
          ))}
        </Tags>
      )}
      {description.everyNode && <p className="rp-note">{t('arrange.everyNode')}</p>}
      {showRules && description.rules.length > 0 && (
        <div className="rp-list">
          <span className="rp-label">{t('arrange.byRule')}</span>
          {description.rules.map(rule => (
            <DaeCode key={rule} as="code" text={rule} />
          ))}
        </div>
      )}
    </>
  );
}
