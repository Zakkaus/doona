import {describeFilters} from '../../../dae/groups';
import {useT} from '../../../i18n';
import {Tag, Tags, LinkTag} from '../../../ui/ui';
import {href} from '../../../shell/route';
import {DaeCode} from '../../../ui/DaeCode';

export function FilterSummary({filters, showRules = true}: {filters: string[]; showRules?: boolean}) {
  const t = useT();
  const description = describeFilters(filters);
  return (
    <>
      {!filters.length && (
        <Tags label={t('policy.includes')}>
          <Tag>{t('group.allNodes')}</Tag>
        </Tags>
      )}
      {description.groups.length > 0 && (
        <Tags label={t('group.nestedGroups')}>
          <span className="rp-label rp-tags-title">{t('group.nestedGroups')}</span>
          {description.groups.map(name => (
            <LinkTag key={name} href={href('policies', {group: name})}>
              {name}
            </LinkTag>
          ))}
        </Tags>
      )}
      {description.everyNode && <p className="rp-note">{t('group.everyNode')}</p>}
      {showRules && description.rules.length > 0 && (
        <div className="rp-list">
          <span className="rp-label">{t('group.byRule')}</span>
          {description.rules.map(rule => (
            <DaeCode key={rule} as="code" text={rule} />
          ))}
        </div>
      )}
    </>
  );
}
