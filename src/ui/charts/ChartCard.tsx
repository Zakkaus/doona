import {useId, useState, type ReactNode} from 'react';
import {Button as RButton, Disclosure, DisclosurePanel, Heading} from 'react-aria-components';
import ChevronDown from '../icons/ChevronDown';

const key = (id: string) => 'doona-chart-' + id;
function readOpen(id: string, fallback: boolean): boolean {
  try {
    const saved = localStorage.getItem(key(id));
    return saved === null ? fallback : saved === 'open';
  } catch {
    return fallback;
  }
}
function writeOpen(id: string, open: boolean) {
  try {
    localStorage.setItem(key(id), open ? 'open' : 'closed');
  } catch {}
}

// A chart card leads with its question and a one-sentence answer, so the card reads without the chart; the
// sample line says what the chart is drawn from. Folded or not is remembered per viewer; a card above a table the
// page is for starts folded, so the table stays where it was and the answer still shows.
export function ChartCard({
  id,
  question,
  answer,
  sample,
  defaultOpen = true,
  children
}: {
  id: string;
  question: string;
  answer: ReactNode;
  sample?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => readOpen(id, defaultOpen));
  const answerId = useId();
  return (
    <Disclosure
      className="rp-card rp-chartcard"
      isExpanded={open}
      onExpandedChange={next => {
        setOpen(next);
        writeOpen(id, next);
      }}
    >
      <Heading level={3} className="rp-chartcard-head">
        <RButton slot="trigger" className="rp-btn quiet rp-disclosure-trigger" aria-describedby={answerId}>
          <ChevronDown />
          {question}
        </RButton>
      </Heading>
      <p className="rp-chartcard-answer" id={answerId}>
        {answer}
      </p>
      {sample && <p className="rp-note">{sample}</p>}
      <DisclosurePanel className="rp-disclosure-panel">
        <div className="rp-chartcard-body">{children}</div>
      </DisclosurePanel>
    </Disclosure>
  );
}

export function BigNumber({label, value, detail, tone}: {label: string; value: string; detail?: string; tone?: 'positive' | 'notice' | 'negative'}) {
  return (
    <div className={'rp-bignum' + (tone ? ' ' + tone : '')}>
      <span className="rp-label">{label}</span>
      <span className="value">{value}</span>
      {detail && <span className="rp-note">{detail}</span>}
    </div>
  );
}
