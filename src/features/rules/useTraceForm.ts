import {useMemo, useState} from 'react';
import {useLinked} from '../../ui/ui';
import {parseTraceLink} from '../shared/link';

// The trace form's state, apart from the trace tab's own module: the rules page holds it and loads the tab lazily.
export type TraceResolve = 'none' | 'live' | 'query';
const blankForm = {
  network: 'tcp' as 'tcp' | 'udp',
  domain: '',
  dst_ip: '',
  dst_port: '',
  src_ip: '',
  src_port: '',
  pname: '',
  dscp: '',
  // Null until the backend says what it offers: live when it can resolve, else none.
  resolve: null as TraceResolve | null
};
// Held by the rules page rather than the trace tab, so what was typed survives a tab switch. A link that names a
// target fills the form in, opening the advanced fields when it names the source or process; it does not run the trace.
export function useTraceForm(query: string) {
  const linked = useMemo(() => parseTraceLink(query), [query]);
  const [form, setForm] = useState(() => (linked ? {...blankForm, ...linked} : blankForm));
  const [advanced, setAdvanced] = useState(!!(linked?.src_ip || linked?.src_port || linked?.pname));
  useLinked(linked && JSON.stringify(linked), () => {
    if (!linked) return;
    setForm({...blankForm, ...linked});
    setAdvanced(!!(linked.src_ip || linked.src_port || linked.pname));
  });
  const touched = (Object.keys(blankForm) as Array<keyof typeof blankForm>).some(key => key !== 'resolve' && key !== 'network' && form[key] !== blankForm[key]);
  return {form, setForm, advanced, setAdvanced, touched};
}
export type TraceForm = ReturnType<typeof useTraceForm>;
