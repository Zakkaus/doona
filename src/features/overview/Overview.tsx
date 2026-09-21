import {useOverview} from './useOverview';
import {useT} from '../../i18n';
import {Badge, Bar, Button, DataTable, Kv, Light, TextTooltip, ErrorMessage, Loading, Empty} from '../../ui/ui';
import Download from '../../ui/icons/Download';
import {LifecycleActions} from './Lifecycle';
export function Overview() {
  const t = useT();
  const vm = useOverview();
  return (
    <div className="rp-page">
      {vm.errors.capabilities && <ErrorMessage error={vm.errors.capabilities} />}
      <div className="rp-between">
        <div className="rp-cluster">
          <Light tone={vm.status.tone}>{vm.status.text}</Light>
          <Kv row items={vm.strip} />
          {vm.reload && (
            <TextTooltip text={vm.reload.tooltip}>
              <Light small tone={vm.reload.tone}>
                {vm.reload.text}
              </Light>
            </TextTooltip>
          )}
        </div>
        <div className="rp-cluster">
          <Button isDisabled={!vm.canExport} onPress={vm.export}>
            <Download />
            {t('ov.export')}
          </Button>
          <LifecycleActions actions={vm.actions} />
        </div>
      </div>
      {vm.errors.runtime && <ErrorMessage error={vm.errors.runtime} onRetry={vm.retry} />}
      <div className="rp-g3">
        <section className="rp-card" aria-labelledby="overview-engine">
          <h3 className="rp-h3" id="overview-engine">
            {t('ov.engine')}
          </h3>
          {vm.errors.version && <ErrorMessage error={vm.errors.version} />}
          {vm.engine.state === 'ready' ? (
            <>
              <Kv items={vm.engine.fields} />
              {vm.engine.profiles.length > 0 && (
                <div className="rp-cluster">
                  {vm.engine.profiles.map(profile => (
                    <Badge key={profile.id}>{profile.text}</Badge>
                  ))}
                </div>
              )}
            </>
          ) : vm.engine.state === 'loading' ? (
            <Loading />
          ) : (
            <Empty>{t('ov.unavailable')}</Empty>
          )}
        </section>
        <section className="rp-card" aria-labelledby="overview-counters">
          <h3 className="rp-h3" id="overview-counters">
            {t('ov.counters')}
          </h3>
          {vm.counters.state === 'ready' ? (
            <>
              <Kv items={vm.counters.fields} />
              <span className="rp-label">{vm.counters.since}</span>
            </>
          ) : vm.counters.state === 'loading' ? (
            <Loading />
          ) : (
            <Empty>{t('ov.unavailable')}</Empty>
          )}
        </section>
        <section className="rp-card" aria-labelledby="overview-memory">
          <h3 className="rp-h3" id="overview-memory">
            {t('ov.memory')}
          </h3>
          {vm.errors.memory && <ErrorMessage error={vm.errors.memory} />}
          {vm.memory.state === 'ready' ? (
            <>
              {vm.memory.bar && <Bar label={vm.memory.bar.label} value={vm.memory.bar.value} pct={vm.memory.bar.pct} color={vm.memory.bar.color} />}
              <Kv items={vm.memory.fields} />
            </>
          ) : vm.memory.state === 'loading' ? (
            <Loading />
          ) : (
            <Empty>{t('ov.unavailable')}</Empty>
          )}
        </section>
      </div>
      <div className="rp-g21">
        <section className="rp-card" aria-labelledby="overview-datapath">
          <h3 className="rp-h3" id="overview-datapath">
            {t('ov.datapath')}
          </h3>
          {vm.errors.datapath && <ErrorMessage error={vm.errors.datapath} />}
          {vm.datapath.state === 'ready' ? (
            <>
              <Kv items={vm.datapath.fields} />
              {vm.datapath.showAttachments && (
                <DataTable
                  label={t('ov.attachments')}
                  height={250}
                  rows={vm.datapath.attachments}
                  empty={t('ov.unknown')}
                  cols={[
                    {id: 'n', label: t('ov.name'), minWidth: 128, isRowHeader: true, render: a => a.name},
                    {id: 'i', label: t('ov.interface'), minWidth: 88, drop: 2, render: a => a.interface},
                    {id: 'd', label: t('ov.direction'), minWidth: 80, grow: 0, drop: 1, render: a => a.direction},
                    {id: 's', label: t('ov.state'), minWidth: 88, grow: 0, render: a => a.state}
                  ]}
                />
              )}
              {(vm.datapath.errors.length > 0 || vm.datapath.warning) && (
                <div className="rp-cluster">
                  {vm.datapath.errors.map((error, i) => (
                    <TextTooltip key={i} text={error.tooltip}>
                      <Light small tone="err">
                        {error.text}
                      </Light>
                    </TextTooltip>
                  ))}
                  {vm.datapath.warning && (
                    <Light small tone="warn">
                      {vm.datapath.warning}
                    </Light>
                  )}
                </div>
              )}
            </>
          ) : vm.datapath.state === 'loading' ? (
            <Loading />
          ) : (
            <Empty>{t('ov.unavailable')}</Empty>
          )}
        </section>
        <section className="rp-card" aria-labelledby="overview-resources">
          <h3 className="rp-h3" id="overview-resources">
            {t('ov.resources')}
          </h3>
          {vm.resources.state === 'ready' ? (
            <div className="rp-list rp-list-columns">
              {vm.resources.rows.map(row => (
                <div key={row.id} className="rp-row">
                  <span>{row.label}</span>
                  <Light small tone={row.tone}>
                    {row.text}
                  </Light>
                </div>
              ))}
            </div>
          ) : vm.resources.state === 'loading' ? (
            <Loading />
          ) : (
            <Empty>{t('ov.unavailable')}</Empty>
          )}
        </section>
      </div>
    </div>
  );
}
