import {useOverview} from './useOverview';
import {useT} from '../../i18n';
import {ActionGroup, Badge, Card, Bar, DataTable, Kv, Light, TextTooltip, ErrorMessage, Loading, Empty} from '../../ui/ui';
import Download from '../../ui/icons/Download';
import {tableLayout} from '../../ui/Table';

// While a section loads, invisible cells in the loaded body's grid wrap into the same rows at any width, so the
// card keeps its height when the values arrive; `extra` holds the lines below the grid.
function BodyWait({cells, extra = 0}: {cells: number; extra?: number}) {
  return (
    <div className="rp-body-wait">
      <div className="rp-kv" aria-hidden="true">
        {Array.from({length: cells}, (_, i) => (
          <div key={i}>
            <span className="k">{'\u00a0'}</span>
            <span className="v">{'\u00a0'}</span>
          </div>
        ))}
      </div>
      {extra > 0 && <div aria-hidden="true" style={{height: extra}} />}
      <Loading />
    </div>
  );
}
// The least the attachments table takes: its frame, heading and two rows.
const attachmentsFloor = 2 + tableLayout.headingHeight + 2 * tableLayout.rowHeight;
export function Overview() {
  const t = useT();
  const vm = useOverview();
  return (
    <div className="rp-page">
      <ErrorMessage error={vm.errors.capabilities} onRetry={vm.retry.capabilities} />
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
          <ActionGroup actions={[{id: 'export', label: t('ov.export'), icon: <Download />, isDisabled: !vm.canExport, onAction: vm.export}, ...vm.actions]} />
        </div>
      </div>
      <div className="rp-g3">
        <Card title={t('ov.engine')}>
          <ErrorMessage error={vm.errors.version} onRetry={vm.retry.version} />
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
            <BodyWait cells={6} extra={vm.engine.profiles.length > 0 ? 20 : 0} />
          ) : vm.errors.version ? null : (
            <Empty>{t('ov.unavailable')}</Empty>
          )}
        </Card>
        <Card title={t('ov.counters')}>
          <ErrorMessage error={vm.errors.runtime} onRetry={vm.retry.runtime} />
          {vm.counters.state === 'ready' ? (
            <>
              <Kv items={vm.counters.fields} />
              <span className="rp-label">{vm.counters.since}</span>
            </>
          ) : vm.counters.state === 'loading' ? (
            <BodyWait cells={6} extra={16} />
          ) : vm.errors.runtime ? null : (
            <Empty>{t('ov.unavailable')}</Empty>
          )}
        </Card>
        <Card title={t('ov.memory')}>
          <ErrorMessage error={vm.errors.memory} onRetry={vm.retry.memory} />
          {vm.memory.state === 'ready' ? (
            <>
              {vm.memory.bar && <Bar label={vm.memory.bar.label} value={vm.memory.bar.value} pct={vm.memory.bar.pct} color={vm.memory.bar.color} />}
              <Kv items={vm.memory.fields} />
            </>
          ) : vm.memory.state === 'loading' ? (
            <BodyWait cells={8} />
          ) : vm.errors.memory ? null : (
            <Empty>{t('ov.unavailable')}</Empty>
          )}
        </Card>
      </div>
      <div className="rp-g21 rp-overview-lower">
        <Card title={t('ov.datapath')}>
          <ErrorMessage error={vm.errors.datapath} onRetry={vm.retry.datapath} />
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
            <BodyWait cells={10} extra={attachmentsFloor} />
          ) : vm.errors.datapath ? null : (
            <Empty>{t('ov.unavailable')}</Empty>
          )}
        </Card>
        <Card title={t('ov.resources')}>
          {vm.resources.state === 'ready' ? (
            <div className="rp-capabilities">
              {vm.resources.rows.map(row => (
                <div key={row.id} className={'rp-capability' + (row.tone === 'muted' ? ' unavailable' : '')}>
                  <span>{row.label}</span>
                  <Light small tone={row.tone}>
                    {row.text}
                  </Light>
                </div>
              ))}
            </div>
          ) : vm.resources.state === 'loading' ? (
            <Loading />
          ) : vm.errors.capabilities ? null : (
            <Empty>{t('ov.unavailable')}</Empty>
          )}
        </Card>
      </div>
    </div>
  );
}
