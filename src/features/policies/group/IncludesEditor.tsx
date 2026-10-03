import {Fragment} from 'react';
import {NodeName} from '../../../ui/NodeName';
import {ConditionActions, ConditionRow} from '../../../ui/ConditionRow';
import type {GroupConditionKind} from '../../../dae/groupConditions';
import {useT} from '../../../i18n';
import {Button, DialogSection, Disclosure, InlineAlert, LabeledSelect, Link, Switch, Tag, Tags, TextField} from '../../../ui/ui';
import Close from '../../../ui/icons/Close';
import AddCircle from '../../../ui/icons/AddCircle';
import {CheckboxSet} from '../../../ui/CheckboxSet';
import {SearchMultiSelect} from '../../../ui/SearchMultiSelect';
import type {GroupDialogView} from './useGroupDialog';

export function IncludesEditor({model: m}: {model: GroupDialogView}) {
  const t = useT();
  return (
    <>
      {m.includes.tags.length > 0 && (
        <Tags label={t('policy.includes')}>
          {m.includes.tags.map(tag => (
            <Tag
              key={tag.id}
              action={
                <Button quiet icon small label={tag.removeLabel} isDisabled={m.busy} onPress={tag.remove}>
                  <Close />
                </Button>
              }
            >
              {tag.nodeName ? <NodeName name={tag.label} /> : tag.label}
            </Tag>
          ))}
        </Tags>
      )}
      {m.includes.stillIn && <InlineAlert tone="informative">{m.includes.stillIn}</InlineAlert>}
      <Switch isSelected={m.includes.everyNode} onChange={m.includes.changeEveryNode} isDisabled={m.busy}>
        {t('group.allNodes')}
      </Switch>
      <CheckboxSet
        label={t('policy.regions')}
        items={m.includes.choices.region}
        value={m.includes.selected.region}
        onChange={value => m.includes.change('region', value)}
        isDisabled={m.busy}
      />
      {m.includes.choices.subscription.length > 0 && (
        <CheckboxSet
          label={t('group.subscriptions')}
          items={m.includes.choices.subscription}
          value={m.includes.selected.subscription}
          onChange={value => m.includes.change('subscription', value)}
          isDisabled={m.busy}
        />
      )}
      <SearchMultiSelect
        label={t('group.nestedGroups')}
        searchLabel={t('group.searchGroups')}
        summary={m.includes.groupSummary}
        items={m.includes.choices.group}
        value={m.includes.selected.group}
        onChange={value => m.includes.change('group', value)}
        isDisabled={m.busy}
      />
      <SearchMultiSelect
        label={t('group.nodes')}
        searchLabel={t('group.search')}
        summary={m.includes.nodeSummary}
        description={m.includes.count}
        action={
          m.nodesHref && (
            <Link appearance="button" quiet small href={m.nodesHref}>
              {t('policy.viewNodes')}
            </Link>
          )
        }
        items={m.includes.choices.node}
        value={m.includes.selected.node}
        onChange={value => m.includes.change('node', value)}
        isDisabled={m.busy}
      />
      {m.includes.names.length > 0 && (
        <Disclosure flush title={t('group.matchingNodes')}>
          <Tags label={t('group.matchingNodes')}>
            {m.includes.names.map(name => (
              <Tag key={name}>
                <NodeName name={name} />
              </Tag>
            ))}
          </Tags>
        </Disclosure>
      )}
      <Disclosure flush title={t('policy.advanced')} defaultExpanded={m.includes.advanced}>
        <div className="group-dialog-filters" role="group" aria-label={t('ui.filter')}>
          <div className="group-dialog-filter-list">
            {m.filters.map((field, index) => (
              <Fragment key={field.id}>
                {index > 0 && (
                  <Tags label={t('group.filterOr')}>
                    <Tag>{t('group.filterOr')}</Tag>
                  </Tags>
                )}
                <DialogSection title={field.label}>
                  {field.rows ? (
                    <>
                      {field.rows.map((row, rowIndex) => (
                        <Fragment key={row.id}>
                          {rowIndex > 0 && (
                            <Tags label={t('group.filterAnd')}>
                              <Tag>{t('group.filterAnd')}</Tag>
                            </Tags>
                          )}
                          <ConditionRow
                            negate={row.negate}
                            onNegate={row.setNegate}
                            negateLabel={t('rule.negate')}
                            removeLabel={t('rule.removeCondition')}
                            onRemove={row.remove}
                            removeDisabled={!row.removable}
                            isDisabled={m.busy}
                          >
                            {row.terms.map(term => (
                              <Fragment key={term.id}>
                                {!term.first && (
                                  <Tags label={t('group.filterOr')}>
                                    <Tag>{t('group.filterOr')}</Tag>
                                  </Tags>
                                )}
                                <LabeledSelect
                                  label={t('rule.kind')}
                                  value={term.kind}
                                  onChange={kind => term.setKind(kind as GroupConditionKind)}
                                  items={term.kinds}
                                  isDisabled={m.busy}
                                />
                                <TextField
                                  label={t('rule.values')}
                                  value={term.value}
                                  onChange={term.setValue}
                                  description={t('group.filterValuesHelp')}
                                  error={field.error ? t('group.filterValuesInvalid') : undefined}
                                  spellCheck={false}
                                  isDisabled={m.busy}
                                />
                                {term.remove && (
                                  <ConditionActions>
                                    <Button small isDisabled={m.busy} onPress={term.remove}>
                                      {t('group.removeAlternative')}
                                    </Button>
                                  </ConditionActions>
                                )}
                              </Fragment>
                            ))}
                            <ConditionActions>
                              <Button small isDisabled={m.busy} onPress={row.addAlternative}>
                                {t('group.addAlternative')}
                              </Button>
                            </ConditionActions>
                          </ConditionRow>
                        </Fragment>
                      ))}
                    </>
                  ) : (
                    <TextField label={t('group.customExpression')} value={field.value} isDisabled={m.busy} spellCheck={false} onChange={field.change} />
                  )}
                  <ConditionActions>
                    {field.rows && (
                      <Button small isDisabled={m.busy} onPress={field.addRow}>
                        {t('rule.addCondition')}
                      </Button>
                    )}
                    <Button small isDisabled={m.busy} onPress={field.remove}>
                      {field.removeLabel}
                    </Button>
                  </ConditionActions>
                </DialogSection>
              </Fragment>
            ))}
          </div>
          <Button secondary isDisabled={m.busy} onPress={m.add}>
            <AddCircle />
            {t('policy.addFilter')}
          </Button>
        </div>
      </Disclosure>
    </>
  );
}
