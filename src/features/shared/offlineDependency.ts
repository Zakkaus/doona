import type {ConfigDiagnostic} from '../../api/model';
import type {Key, Translator} from '../../i18n';
import {diagnosticMessage, type BackendMessage} from '../../i18n/backend';

// honk's native_api/offline.rs: a file the configuration depends on could not be read, one code per io error kind. The
// diagnostic names neither the file nor the setting that points to it. Only the pages that list diagnostics load this.
const offlineDependency: Record<string, Key> = {
  'missing-offline-dependency': 'config.diagnostic.offlineMissing',
  'offline-dependency-denied': 'config.diagnostic.offlineDenied',
  'invalid-offline-dependency': 'config.diagnostic.offlineInvalid',
  'unreadable-offline-dependency': 'config.diagnostic.offlineUnreadable'
};

export const offlineDependencyCode = (code: string) => Object.hasOwn(offlineDependency, code);

// A config diagnostic as `diagnosticMessage` words it, except an offline dependency, which says which file is missing:
// `missingFiles` when the caller knows them, else where such a file usually comes from. Its backend words say nothing
// more, so they stay under Details and in copied errors.
export function explainDiagnostic(item: ConfigDiagnostic, t: Translator, missingFiles?: string): BackendMessage {
  if (!offlineDependencyCode(item.code)) return diagnosticMessage(item, t);
  return {
    summary: t('config.diagnostic.offline', {
      reason: t(offlineDependency[item.code]),
      which: missingFiles ? t('config.diagnostic.offlineGeodata', {files: missingFiles}) : t('config.diagnostic.offlineUsual')
    })
  };
}

// The backend's words a diagnostic's shown line leaves out, once each, for Details and a bug report.
export const backendWords = (lines: {item: ConfigDiagnostic; message: string}[]) => [
  ...new Set(lines.flatMap(({item, message}) => (item.message && !message.includes(item.message) ? [item.message] : [])))
];
