import {useT} from '../../i18n';
import {useCapabilities, useVersion} from '../../store';
import {offered} from '../../api/capabilities';
import {engineOf} from '../../api/engines';
import {href} from '../../shell/route';
import {latencyProbeChoice, probeChoices, saveProbeOptions, useProbeOptions, type ProbeFamily} from '../../store/probeOptions';
import {Card, ErrorMessage, LabeledSelect, Link, Loading, Toolbar} from '../../ui/ui';
import {settingsCard} from './nav';

const card = settingsCard('probes');

// What the Probe buttons and the options dialog send, saved in this browser. honk's background health checks are
// configuration and keep their one editor on the configuration page.
export function ProbeSettingsCard() {
  const t = useT();
  const caps = useCapabilities();
  const version = useVersion().data;
  const options = useProbeOptions();
  const resources = caps.data?.resources;
  const choices = probeChoices(caps.data, 'node');
  const versions = resources?.probes.ip_versions ?? [];
  const config = offered(resources, 'config', {whileLoading: false}) && engineOf(version).globalSettings ? href('config', {tab: 'global'}) : null;
  return (
    <Card level={2} title={t(card.titleKey)} titleId={card.headingId}>
      {!resources ? (
        caps.error ? (
          <ErrorMessage error={caps.error} onRetry={caps.refetch} />
        ) : (
          <div className="rp-chart-wait form">
            <Loading />
          </div>
        )
      ) : !choices.length ? (
        <span className="rp-label">{t('settings.probesUnavailable')}</span>
      ) : (
        <>
          <span className="rp-label">{t('settings.probesNote')}</span>
          <Toolbar className="top rp-fieldgrid">
            <div className="rp-contents" data-setting="probeMethod">
              <LabeledSelect
                label={t('settings.probeMethod')}
                description={t('settings.probeMethodHelp')}
                value={latencyProbeChoice(choices, options.choice)!.id}
                onChange={choice => saveProbeOptions({choice})}
                items={choices.map(choice => ({id: choice.id, label: t(choice.label)}))}
              />
            </div>
            <div className="rp-contents" data-setting="probeFamily">
              <LabeledSelect
                label={t('settings.probeFamily')}
                description={t('settings.probeFamilyHelp')}
                value={options.family !== 'auto' && versions.includes(options.family) ? options.family : 'auto'}
                onChange={family => saveProbeOptions({family: family as ProbeFamily})}
                items={[{id: 'auto', label: t('settings.probeFamilyAuto')}, ...versions.map(id => ({id, label: id === 'ipv4' ? 'IPv4' : 'IPv6'}))]}
              />
            </div>
            <div className="rp-contents" data-setting="probeWarmth">
              <LabeledSelect
                label={t('settings.probeWarmth')}
                description={t('settings.probeWarmthHelp')}
                value={options.cold ? 'cold' : 'warm'}
                onChange={warmth => saveProbeOptions({cold: warmth === 'cold'})}
                items={[
                  {id: 'warm', label: t('settings.probeWarm')},
                  {id: 'cold', label: t('settings.probeCold')}
                ]}
              />
            </div>
            <div className="rp-contents" data-setting="probeMembers">
              <LabeledSelect
                label={t('settings.probeMembers')}
                description={t('settings.probeMembersHelp')}
                value={options.leaves ? 'leaves' : 'direct'}
                onChange={members => saveProbeOptions({leaves: members === 'leaves'})}
                items={[
                  {id: 'direct', label: t('settings.probeDirect')},
                  {id: 'leaves', label: t('settings.probeLeaves')}
                ]}
              />
            </div>
          </Toolbar>
        </>
      )}
      {resources && <span className="rp-label">{t('settings.probesChecks')}</span>}
      {resources && config && (
        <div className="rp-cluster">
          <Link appearance="button" href={config}>
            {t('settings.probesConfig')}
          </Link>
        </div>
      )}
    </Card>
  );
}
