import {useState} from 'react';
import {useCapabilities, useRuntimeSettings} from '../../api/store';
import type {RuntimeSettingField, RuntimeSettings, RuntimeSettingsPatch} from '../../api/model';
import {formatNumber, useLang, useT, LOCALE} from '../../i18n';
import {Button, ErrorMessage, LabeledSelect, Light, Loading, TextField, errorText, toast} from '../../ui/ui';

type Numeric = Exclude<RuntimeSettingField, 'log.level'>;
const numericFields: Numeric[] = ['log.buffered_records', 'dns_log.max_records', 'flows.max_flows', 'flows.retention_seconds'];
const at = (settings: RuntimeSettings, field: Numeric): number => {
  const [section, key] = field.split('.') as ['log' | 'dns_log' | 'flows', string];
  return (settings[section] as Record<string, number>)[key];
};

// The settings the backend lets a client change without a reload. The form edits a copy; Apply sends only
// what differs, as one merge PATCH, and the reply becomes the new baseline.
export function RuntimeSettingsCard() {
  const t = useT();
  const locale = LOCALE[useLang()];
  const caps = useCapabilities();
  const capabilities = caps.data?.resources;
  const available = capabilities?.runtime_settings.available ?? false;
  const fields = new Set<RuntimeSettingField>(capabilities?.runtime_settings.fields ?? []);
  const settings = useRuntimeSettings(available);
  const baseline = settings.data;
  // Edits are kept apart from the baseline and dropped once the backend reports different values; a poll that
  // only restamps observed_at keeps them.
  type Edits = {at: string; level?: string; values: Partial<Record<Numeric, string>>};
  const stamp = baseline ? JSON.stringify([baseline.log, baseline.dns_log, baseline.flows]) : '';
  const [draft, setDraft] = useState<Edits>({at: '', values: {}});
  const edits = baseline && draft.at === stamp ? draft : {at: stamp, values: {}};
  const level = edits.level ?? baseline?.log.level ?? '';
  const values = Object.fromEntries(numericFields.map(field => [field, edits.values[field] ?? (baseline ? String(at(baseline, field)) : '')])) as Record<
    Numeric,
    string
  >;
  const setLevel = (value: string) => setDraft({...edits, level: value});
  const setValue = (field: Numeric, value: string) => setDraft({...edits, values: {...edits.values, [field]: value}});
  const ceilings: Record<Numeric, number | undefined> = {
    'log.buffered_records': capabilities?.logs.max_buffered_records,
    'dns_log.max_records': capabilities?.dns_log.max_records,
    'flows.max_flows': capabilities?.flows.max_flows,
    'flows.retention_seconds': capabilities?.flows.retention_seconds
  };
  const floors: Record<Numeric, number> = {'log.buffered_records': 64, 'dns_log.max_records': 64, 'flows.max_flows': 64, 'flows.retention_seconds': 1};
  const labels: Record<RuntimeSettingField, string> = {
    'log.level': t('settings.logLevel'),
    'log.buffered_records': t('settings.logBuffer'),
    'dns_log.max_records': t('settings.dnsLogSize'),
    'flows.max_flows': t('settings.flowsMax'),
    'flows.retention_seconds': t('settings.flowsRetention')
  };
  const invalid = (field: Numeric) => {
    const value = Number(values[field]);
    const ceiling = ceilings[field];
    return !/^\d+$/.test(values[field] ?? '') || value < floors[field] || (ceiling !== undefined && value > ceiling);
  };
  const patch: RuntimeSettingsPatch = {};
  if (baseline) {
    if (fields.has('log.level') && level !== baseline.log.level) patch.log = {level: level as RuntimeSettings['log']['level']};
    for (const field of numericFields) {
      if (!fields.has(field) || invalid(field) || Number(values[field]) === at(baseline, field)) continue;
      const [section, key] = field.split('.') as ['log' | 'dns_log' | 'flows', string];
      ((patch[section] ??= {}) as Record<string, number>)[key] = Number(values[field]);
    }
  }
  const dirty = Object.keys(patch).length > 0;
  const blocked = numericFields.some(field => fields.has(field) && invalid(field));
  return (
    <section className="rp-card" aria-labelledby="settings-runtime">
      <div className="rp-row">
        <h2 className="rp-h3" id="settings-runtime">
          {t('settings.runtime')}
        </h2>
        {baseline && (
          <Light tone={baseline.source === 'runtime' ? 'info' : 'neutral'}>
            {t(baseline.source === 'runtime' ? 'settings.sourceRuntime' : 'settings.sourceConfig')}
          </Light>
        )}
      </div>
      {!capabilities ? (
        caps.error ? (
          <ErrorMessage error={caps.error} />
        ) : (
          <Loading />
        )
      ) : (
        <span className="rp-label">{available ? t('settings.runtimeNote') : t('settings.runtimeUnavailable')}</span>
      )}
      {capabilities && available && (
        <>
          <ErrorMessage error={settings.error} />
          {settings.loading && !baseline && <Loading />}
          {baseline && (
            <div className="rp-toolbar top">
              {fields.has('log.level') && (
                <LabeledSelect
                  label={labels['log.level']}
                  value={level}
                  onChange={setLevel}
                  items={(capabilities.logs.levels ?? ['trace', 'debug', 'info', 'warn', 'error']).map(item => ({id: item, label: item}))}
                />
              )}
              {numericFields
                .filter(field => fields.has(field))
                .map(field => (
                  <TextField
                    key={field}
                    width={180}
                    type="text"
                    label={labels[field]}
                    value={values[field] ?? ''}
                    isInvalid={invalid(field)}
                    onChange={value => setValue(field, value.trim())}
                    description={
                      ceilings[field] === undefined
                        ? undefined
                        : t('settings.range', {min: formatNumber(floors[field], locale), max: formatNumber(ceilings[field]!, locale)})
                    }
                  />
                ))}
            </div>
          )}
          {baseline && (
            <div className="rp-toolbar">
              <Button
                accent
                isPending={settings.busy}
                isDisabled={!dirty || blocked}
                onPress={() => {
                  settings.save(patch).then(
                    () => toast('positive', t('settings.runtimeSaved')),
                    (error: unknown) => toast('negative', errorText(error))
                  );
                }}
              >
                {t('settings.apply')}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
