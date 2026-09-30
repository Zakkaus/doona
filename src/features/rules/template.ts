import type {ConfigSource} from '../../api/model';
import type {Key, Translator} from '../../i18n';
import {scanConfig} from '../../dae/text';
import {detectTemplate, templates, type RuleTemplate} from '../../dae/templates';

// The plain choices first; the ACL4SSR presets, which also create groups, are kept under More templates.
export const primaryTemplates: RuleTemplate[] = ['bypass', 'gfw', 'global'];
export const moreTemplates: RuleTemplate[] = ['mini', 'standard', 'full'];
const templateText: Record<RuleTemplate, [Key, Key]> = {
  bypass: ['rule.template.bypass', 'rule.template.bypassHelp'],
  gfw: ['rule.template.gfw', 'rule.template.gfwHelp'],
  global: ['rule.template.global', 'rule.template.globalHelp'],
  mini: ['rule.template.mini', 'rule.template.miniHelp'],
  standard: ['rule.template.standard', 'rule.template.standardHelp'],
  full: ['rule.template.full', 'rule.template.fullHelp']
};
export type TemplateChoice = {id: RuleTemplate; name: string; help: string};
export function templateChoice(id: RuleTemplate, t: Translator): TemplateChoice {
  const [name, help] = templateText[id];
  return {id, name: t(name), help: t(help, {groups: templates[id].groups.map(group => group.name).join(', ')})};
}

// The files a person writes whose top level holds a routing block; generated and subscription files hold none.
export function routingSources(sources: ConfigSource[]): ConfigSource[] {
  return sources.filter(
    source =>
      (source.kind === 'main' || source.kind === 'include') && !!source.content && scanConfig(source.content).blocks.some(block => block.name === 'routing')
  );
}

// The template the routing holds, when one file holds all of it; routing split over files is custom.
export function currentTemplate(sources: ConfigSource[]): RuleTemplate | null {
  const holders = routingSources(sources);
  return holders.length === 1 ? (detectTemplate(holders[0].content!)?.template ?? null) : null;
}

export type TemplatesView = {current: TemplateChoice | null; primary: TemplateChoice[]; more: TemplateChoice[]};
export function templatesView(sources: ConfigSource[], t: Translator): TemplatesView {
  const current = currentTemplate(sources);
  return {
    current: current && templateChoice(current, t),
    primary: primaryTemplates.map(id => templateChoice(id, t)),
    more: moreTemplates.map(id => templateChoice(id, t))
  };
}
