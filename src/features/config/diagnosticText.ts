import type {ConfigDiagnostic} from '../../api/model';
import type {Key} from '../../i18n/messages';

// Diagnostics reach the UI as English text plus an adapter code. For the codes we know, the text is
// rebuilt from the code and the quoted token in the message; anything else is shown as the engine wrote it.
const known: Record<string, Key> = {
  unknown_section: 'config.d.unknownSection',
  unknown_key: 'config.d.unknownKey',
  not_a_setting: 'config.d.notASetting',
  brace_without_section: 'config.d.braceWithoutSection',
  section_not_closed: 'config.d.sectionNotClosed',
  not_a_rule: 'config.d.notARule',
  unknown_outbound: 'config.d.unknownOutbound',
  bare_condition: 'config.d.bareCondition',
  interface_auto: 'config.d.interfaceAuto',
  mac_unseen: 'config.d.macUnseen',
  subscription_cached: 'config.d.subscriptionCached'
};
export function diagnosticText(item: ConfigDiagnostic, t: (key: Key, params?: Record<string, string | number>) => string): string {
  const key = known[item.code];
  if (!key) return item.message;
  const quoted = /"([^"]*)"/.exec(item.message)?.[1] ?? /\(([^)]*)\)/.exec(item.message)?.[1] ?? '';
  return t(key, {name: quoted});
}
