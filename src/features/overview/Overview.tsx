import {cardHeadings, useOverview} from './useOverview';
import {useT} from '../../i18n';
import {
  ActionGroup,
  Badge,
  Button,
  Card,
  HelpRow,
  Bar,
  DataTable,
  Kv,
  Light,
  Link,
  PopoverDialog,
  TextTooltip,
  ErrorMessage,
  Loading,
  Empty,
  VisuallyHidden
} from '../../ui/ui';
import Download from '../../ui/icons/Download';
import InfoCircle from '../../ui/icons/InfoCircle';
import {tableLayout} from '../../ui/Table';
import type {LimitGroup, LimitHelp} from '../shared/limits';
import {ReloadConfirm} from '../shared/ReloadConfirm';
import {DaeCode} from '../../ui/DaeCode';
import type {PageProps} from '../../shell/routes';

// While a section loads, invisible cells in the loaded body's grid wrap into the same rows at any width, so the
// card keeps its height when the values arrive; `extra` holds the lines below the grid.
function BodyWait({cells, extra}: {cells: number; extra?: 'caption' | 'body' | number}) {
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
      {extra && <div aria-hidden="true" style={{height: extra === 'caption' ? 'var(--rp-line-caption)' : extra === 'body' ? 'var(--rp-line-body)' : extra}} />}
      <Loading />
    </div>
  );
}
// A limit's link; one that leaves the app ends with an arrow.
function LimitLink({link}: {link: NonNullable<LimitGroup['link']>}) {
  return (
    <Link appearance="link" external={link.external} href={link.href}>
      {link.text}
      {link.external && <span aria-hidden="true">↗</span>}
    </Link>
  );
}
// After S2's ContextualHelp, with its label beside the icon: a popover with the cause, the settings that lift it and a link.
function LimitHelpButton({help}: {help: LimitHelp}) {
  return (
    <PopoverDialog
      title={help.label}
      placement="bottom end"
      trigger={
        <Button quiet>
          <InfoCircle />
          {help.label}
        </Button>
      }
    >
      {() => (
        <>
          <p className="rp-limit-help">{help.text}</p>
          {help.snippet && <DaeCode as="pre" className="rp-limit-snippet" text={help.snippet} />}
          {help.link && <LimitLink link={help.link} />}
        </>
      )}
    </PopoverDialog>
  );
}
// The least the attachments table takes: its frame, heading and two rows.
const attachmentsFloor = 2 + tableLayout.headingHeight + 2 * tableLayout.rowHeight;
export function Overview({query}: PageProps) {
  const t = useT();
  const vm = useOverview(query);
  const status = <Light tone={vm.status.tone}>{vm.status.text}</Light>;
  return (
    <div className="rp-page">
      <ErrorMessage error={vm.errors.capabilities} onRetry={vm.retry.capabilities} />
      <div className="rp-between">
        <div className="rp-cluster">
          {vm.status.href ? (
            <Link appearance="link" href={vm.status.href}>
              {status}
            </Link>
          ) : (
            status
          )}
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
          <ReloadConfirm {...vm.confirmReload} />
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
            <BodyWait cells={6} extra={vm.engine.profiles.length > 0 ? 'body' : undefined} />
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
            <BodyWait cells={6} extra="caption" />
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
        <Card title={t('ov.datapath')} titleId={cardHeadings.datapath} help={{title: t('ov.datapath'), text: t('ov.datapathHelp')}}>
          <ErrorMessage error={vm.errors.datapath} onRetry={vm.retry.datapath} />
          {vm.datapath.state === 'ready' ? (
            <>
              <Kv items={vm.datapath.fields} />
              {vm.datapath.showAttachments && (
                <DataTable
                  label={t('ov.attachments')}
                  height={250}
                  rows={vm.datapath.attachments}
                  empty={t('ov.noAttachments')}
                  cols={[
                    {id: 'n', label: t('ov.name'), minWidth: 128, isRowHeader: true, render: a => a.name},
                    {id: 'i', label: t('ov.interface'), minWidth: 88, drop: 2, render: a => a.interface},
                    {id: 'd', label: t('ov.direction'), minWidth: 80, grow: 0, drop: 1, render: a => a.direction},
                    {id: 's', label: t('ov.state'), minWidth: 88, grow: 0, render: a => a.state}
                  ]}
                />
              )}
            </>
          ) : vm.datapath.state === 'loading' ? (
            <BodyWait cells={10} extra={attachmentsFloor} />
          ) : vm.errors.datapath ? null : (
            <Empty>{t('ov.unavailable')}</Empty>
          )}
          {/* The runtime's degradations show even when the datapath could not be read. */}
          {(vm.datapath.errors.length > 0 || vm.datapath.warning || vm.datapath.degradations.length > 0) && (
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
              {vm.datapath.degradations.map(d => (
                <HelpRow key={d.id} help={d.tooltip ? {title: d.text, text: d.tooltip} : undefined}>
                  <Light small tone="warn">
                    {d.text}
                  </Light>
                </HelpRow>
              ))}
            </div>
          )}
        </Card>
        <Card title={t('ov.resources')}>
          {vm.resources.state === 'ready' ? (
            <div className="rp-capabilities">
              {vm.resources.rows.map(row => (
                <div key={row.id} className="rp-capability">
                  {/* The dot leads its label, so a wide column cannot set it nearer the next label than its own. */}
                  <Light tone="ok">
                    <Link appearance="link" href={row.href}>
                      {row.label}
                    </Link>
                  </Light>
                  {/* The status is the dot alone; the text still reaches assistive technology. */}
                  <VisuallyHidden>{row.text}</VisuallyHidden>
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
      {vm.limits.length > 0 && (
        <Card title={t('ov.lim.title')} titleId={cardHeadings.limits}>
          <ul className="rp-limits">
            {vm.limits.map(group => (
              <li key={group.cause} className="rp-limit">
                <div className="rp-limit-text">
                  <span>{group.headline}</span>
                  {group.features && <span className="rp-note">{group.features}</span>}
                </div>
                {group.help ? <LimitHelpButton help={group.help} /> : group.link && <LimitLink link={group.link} />}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
