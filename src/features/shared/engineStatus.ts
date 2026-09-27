import type {Datapath, Runtime} from '../../api/model';
import {enumLabel} from '../../i18n/enum';
import type {Translator as LabelFn} from '../../i18n';
import {lifecycleStates, lifecycleTone} from '../../api/selectors';
import {href} from '../../shell/route';

const tones = ['ok', 'warn', 'err'] as const;
// The engine's status as Overview and Activity show it: the lifecycle, and a datapath that is degraded or failed beside
// it, linking to Overview's Datapath card. The two stay separate states; the tone is the worse of them. `missing` is the
// text while there is no lifecycle state, which each page words for itself.
export function engineStatus(state: Runtime['lifecycle']['state'] | undefined, path: Datapath['state'] | undefined, missing: string, t: LabelFn) {
  const tone = lifecycleTone(state) as (typeof tones)[number];
  const text = state ? enumLabel(lifecycleStates, state, t) : missing;
  if (!state || (path !== 'degraded' && path !== 'failed')) return {tone, text, href: null};
  return {
    tone: tones[Math.max(tones.indexOf(tone), path === 'failed' ? 2 : 1)],
    text: t(path === 'failed' ? 'ov.status.datapathFailed' : 'ov.status.datapathDegraded', {status: text}),
    href: href('overview', {card: 'datapath'})
  };
}
