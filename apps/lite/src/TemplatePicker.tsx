import {useState} from 'react';
import {Selector} from '@astryxdesign/core/Selector';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Stack';
import {templates, templateRules, detectTemplate, defaultTemplateOptions, type RuleTemplate} from '../../../src/dae/templates';
import {EditDialog} from './ui/EditDialog';
import {ReviewBody} from './ui/ReviewDialog';
import {ruleReview} from './ruleReview';
import {parseRuleList} from './ruleDraft';
import {useMessages} from './i18n';

export default function TemplatePicker({text, groups, close, stage}: {text: string; groups: string[]; close: () => void; stage: (text: string) => void}) {
  const t = useMessages();
  const detected = detectTemplate(text);
  const [template, setTemplate] = useState<RuleTemplate>(detected?.template ?? 'gfw');
  const [group, setGroup] = useState(detected?.group ?? groups[0] ?? '');
  const [options, setOptions] = useState(detected ?? defaultTemplateOptions);
  const spec = templates[template];
  const missing = spec.groups.map(item => item.name).filter(name => !groups.includes(name));
  const needsGroup = [...templateRules(template, options), spec.fallback].some(line => line.includes('{group}'));
  const after =
    'routing {\n' +
    [...templateRules(template, options), `fallback: ${spec.fallback}`]
      .map(line => `  ${line}`)
      .join('\n')
      .replaceAll('{group}', () => group) +
    '\n}';
  const replacedRules = parseRuleList(text, 'routing').rows.filter(row => !row.fallback).length;
  return (
    <EditDialog
      open
      title={t.routingTemplates}
      width={800}
      close={close}
      pending={false}
      label={t.replaceRules}
      disabled={!!missing.length || (needsGroup && !group)}
      disabledReason={missing.length ? t.templateMissingGroups.replace('{names}', missing.join(t.listSep)) : t.noTarget}
      confirm={() => {
        stage(after);
        close();
      }}
    >
      <Text type="supporting" color="secondary">
        {t.templateHelp}
      </Text>
      <Selector
        label={t.routingTemplates}
        value={template}
        onChange={value => setTemplate(value as RuleTemplate)}
        options={(Object.keys(templates) as RuleTemplate[]).map(value => ({
          value,
          label: `${t[`template_${value}`]}${detected?.template === value ? ` (${t.current})` : ''}`
        }))}
      />
      {needsGroup && <Selector label={t.target} value={group} options={groups.map(value => ({value, label: value}))} onChange={setGroup} />}
      {missing.length > 0 && <Text>{t.templateMissingGroups.replace('{names}', missing.join(', '))}</Text>}
      <VStack gap={2}>
        {(['networkManagerDirect', 'blockQuic', 'blockAds'] as const).map(key => (
          <CheckboxInput key={key} label={t[key]} value={options[key]} onChange={value => setOptions({...options, [key]: value})} />
        ))}
      </VStack>
      <ReviewBody
        before={text}
        after={after}
        summary={ruleReview(text, after, 'routing', t).filter(line => line !== t.reviewRuleOrder)}
        warning={(replacedRules === 1 ? t.templateReplaceWarningOne : t.templateReplaceWarning).replace('{n}', String(replacedRules))}
      />
    </EditDialog>
  );
}
