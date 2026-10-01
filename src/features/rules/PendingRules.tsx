import {useContext, useEffect, useRef} from 'react';
import {pendingRules, useConfig, usePendingRules} from '../../store';
import {useT} from '../../i18n';
import {Button, Card, InlineAlert} from '../../ui/ui';
import Close from '../../ui/icons/Close';
import {DaeCode} from '../../ui/DaeCode';
import {pendingView} from '../shared/pending';
import {ApplyHeldContext} from '../shared/usePendingApply';

export function PendingRules({review}: {review: boolean}) {
  const t = useT();
  const held = usePendingRules();
  const sources = useConfig(held.rules.length > 0).data?.sources ?? [];
  const view = pendingView(held.rules, held.failure, sources, t);
  const apply = useContext(ApplyHeldContext);
  const ref = useRef<HTMLElement>(null);
  const visible = !!view;
  useEffect(() => {
    if (review && visible) ref.current?.focus();
  }, [review, visible]);
  if (!view) return null;
  return (
    <Card className="rp-list" aria-label={view.title} ref={ref} tabIndex={-1}>
      <div className="rp-cluster">
        <h2 className="rp-h3">{view.title}</h2>
        {view.files && <span className="rp-label">{view.files}</span>}
        <span className="rp-grow" />
        <Button small isPending={held.applying} onPress={() => apply?.()}>
          {t('rule.applyHeld')}
        </Button>
      </div>
      {view.failure && (
        <InlineAlert>
          {view.failure.text}
          {view.failure.lines.map((line, i) => (
            <span key={i} className="rp-label">
              {line}
            </span>
          ))}
        </InlineAlert>
      )}
      {view.rows.map(row => (
        <div key={row.id} className="rp-cluster">
          <DaeCode text={row.line} wrap />
          <span className="rp-label">{row.position}</span>
          <span className="rp-grow" />
          <Button small quiet icon label={t('rule.discard')} isDisabled={held.applying} onPress={() => pendingRules.remove([row.id])}>
            <Close />
          </Button>
        </div>
      ))}
    </Card>
  );
}
