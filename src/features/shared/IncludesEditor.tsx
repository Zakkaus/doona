import {Fragment} from 'react';
import {NodeName} from '../../ui/NodeName';
import {ConditionActions, ConditionRow} from '../../ui/ConditionRow';
import {conditionFamily, newGroupCondition, groupConditionKinds, type GroupConditionKind} from '../../dae/groupConditions';
import {useT} from '../../i18n';
import {Button, DialogSection, Disclosure, InlineAlert, LabeledSelect, Link, Switch, Tag, Tags, TextField} from '../../ui/ui';
import Close from '../../ui/icons/Close';
import AddCircle from '../../ui/icons/AddCircle';
import {CheckboxSet} from '../../ui/CheckboxSet';
import {SearchMultiSelect} from '../../ui/SearchMultiSelect';
import type {GroupDialogView} from './useGroupDialog';

const conditionLabels = {
  nameKeyword: 'group.filterKind.nameKeyword',
  nameRegex: 'group.filterKind.nameRegex',
  nameExact: 'group.filterKind.nameExact',
  subtag: 'group.filterKind.subtag',
  subtagKeyword: 'group.filterKind.subtagKeyword',
  subtagRegex: 'group.filterKind.subtagRegex'
} as const;

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
                            onNegate={negate => field.changeRow({...row, negate})}
                            negateLabel={t('rule.negate')}
                            removeLabel={t('rule.removeCondition')}
                            onRemove={() => field.removeRow(row.id)}
                            removeDisabled={field.rows!.length === 1}
                            isDisabled={m.busy}
                          >
                            {[row, ...(row.alternatives ?? [])].map((term, termIndex) => {
                              const change = (value: typeof term) =>
                                field.changeRow(
                                  termIndex === 0
                                    ? {...row, kind: value.kind, value: value.value}
                                    : {...row, alternatives: row.alternatives!.map(item => (item.id === term.id ? value : item))}
                                );
                              return (
                                <Fragment key={term.id}>
                                  {termIndex > 0 && (
                                    <Tags label={t('group.filterOr')}>
                                      <Tag>{t('group.filterOr')}</Tag>
                                    </Tags>
                                  )}
                                  <LabeledSelect
                                    label={t('rule.kind')}
                                    value={term.kind}
                                    onChange={kind => change({...term, kind: kind as GroupConditionKind})}
                                    items={groupConditionKinds
                                      .filter(kind => kind !== 'group' && (!row.alternatives?.length || conditionFamily(kind) === conditionFamily(row.kind)))
                                      .map(kind => ({id: kind, label: t(conditionLabels[kind as keyof typeof conditionLabels])}))}
                                    isDisabled={m.busy}
                                  />
                                  <TextField
                                    label={t('rule.values')}
                                    value={term.value}
                                    onChange={value => change({...term, value})}
                                    description={t('group.filterValuesHelp')}
                                    error={field.error ? t('group.filterValuesInvalid') : undefined}
                                    spellCheck={false}
                                    isDisabled={m.busy}
                                  />
                                  {termIndex > 0 && (
                                    <ConditionActions>
                                      <Button
                                        small
                                        isDisabled={m.busy}
                                        onPress={() => field.changeRow({...row, alternatives: row.alternatives!.filter(item => item.id !== term.id)})}
                                      >
                                        {t('group.removeAlternative')}
                                      </Button>
                                    </ConditionActions>
                                  )}
                                </Fragment>
                              );
                            })}
                            <ConditionActions>
                              <Button
                                small
                                isDisabled={m.busy}
                                onPress={() => field.changeRow({...row, alternatives: [...(row.alternatives ?? []), {...newGroupCondition(), kind: row.kind}]})}
                              >
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
