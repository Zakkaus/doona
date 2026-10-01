import {useEffect, useRef} from 'react';
import {useT} from '../../i18n';
import {Button, Card, ConfirmDialog, DataTable, DialogForm, ErrorMessage, InlineAlert, TextField} from '../../ui/ui';
import {useDnsUpstreams} from './useDnsUpstreams';

export function DnsUpstreams({focus}: {focus: boolean}) {
  const t = useT();
  const model = useDnsUpstreams();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  const draft = model.draft;
  return (
    <Card
      title={t('rule.dns.upstreams')}
      ref={ref}
      tabIndex={-1}
      aside={
        model.canWrite && (
          <Button small isDisabled={!model.canAdd} onPress={model.add}>
            {t('rule.dns.upstreamAdd')}
          </Button>
        )
      }
    >
      <ErrorMessage error={model.error} onRetry={model.retry} />
      <DataTable
        label={t('rule.dns.upstreams')}
        rows={model.rows}
        fit
        cols={[
          {id: 'name', label: t('ui.name'), isRowHeader: true, minWidth: 100, render: row => row.name},
          {id: 'address', label: t('rule.dns.address'), minWidth: 180, render: row => <span className="rp-code">{row.address}</span>},
          {
            id: 'actions',
            label: t('ui.actions'),
            minWidth: 80,
            grow: 0,
            render: row =>
              model.canWrite && (
                <Button small isDisabled={!row.writable} onPress={() => model.open(row.id)}>
                  {t('config.edit')}
                </Button>
              )
          }
        ]}
      />
      <ConfirmDialog
        title={t(draft?.old ? 'rule.dns.upstreamEdit' : 'rule.dns.upstreamAdd')}
        isOpen={!!draft}
        onCancel={model.close}
        onConfirm={() => void model.save()}
        confirmLabel={t('settings.save')}
        tone="accent"
        isPending={model.saving}
        locked={model.saving || draft?.staged}
        isDisabled={model.disabled}
        reason={model.reason}
      >
        {draft && (
          <DialogForm>
            <TextField
              label={t('ui.name')}
              value={draft.name}
              onChange={name => model.setDraft({...draft, name})}
              isDisabled={model.saving || draft.staged}
              description={draft.old ? t('rule.dns.renameHelp') : undefined}
            />
            <TextField
              label={t('rule.dns.address')}
              value={draft.address}
              onChange={address => model.setDraft({...draft, address})}
              isDisabled={model.saving || draft.staged}
            />
            <ErrorMessage error={model.error} />
            {model.failure && <InlineAlert>{model.failure}</InlineAlert>}
          </DialogForm>
        )}
      </ConfirmDialog>
    </Card>
  );
}
