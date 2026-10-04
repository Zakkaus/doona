import {useT, useLang, LOCALE} from '../../i18n';
import {LabeledSelect, NumberField, Switch, TextField, Toolbar, numberFromText, textFromNumber} from '../../ui/ui';
import {changeTypedInterval, intervalItems, intervalTyped, startTyping} from './subscription';

// A subscription as typed. An empty interval, a null cache and an empty route leave that option to what applies
// without it, so a caller writes only what the person changed.
export type SubscriptionDraft = {name: string; url: string; interval: string; agent: string; cache: boolean | null; route: string};

// The optional fields to show, each with the value that applies while the draft leaves it empty; a field left out
// is not shown.
export type SubscriptionFieldSet = {
  interval?: number | null;
  agent?: {fallback?: string; description?: string};
  cache?: boolean;
  // The groups a fetch can be sent through, for the download route.
  routes?: string[];
};

// The fields alone: the caller owns the draft, checks it and decides what saving it means.
export function SubscriptionFields({
  value,
  onChange,
  fields,
  isDisabled,
  nameError,
  agentError,
  intervalError,
  focusInterval
}: {
  value: SubscriptionDraft;
  onChange: (next: SubscriptionDraft) => void;
  fields: SubscriptionFieldSet;
  isDisabled?: boolean;
  nameError?: string | null;
  agentError?: string | null;
  intervalError?: string | null;
  focusInterval?: boolean;
}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const set = (patch: Partial<SubscriptionDraft>) => onChange({...value, ...patch});
  const route = value.route || 'routing';
  // The interval shown: the draft, or what applies while it is untouched.
  const interval = value.interval || (fields.interval == null ? '' : String(fields.interval));
  const typed = intervalTyped(interval);
  return (
    <>
      <TextField
        isDisabled={isDisabled}
        label={t('ui.name')}
        value={value.name}
        placeholder="sub-a"
        spellCheck={false}
        error={nameError ?? undefined}
        onChange={name => set({name})}
      />
      <TextField
        isDisabled={isDisabled}
        label={t('nodes.url')}
        value={value.url}
        placeholder="https://example.org/sub?token=…"
        spellCheck={false}
        onChange={url => set({url})}
      />
      {fields.interval !== undefined && (
        <>
          <LabeledSelect
            takeFocus={focusInterval}
            label={t('nodes.interval')}
            items={[...(fields.interval === null ? [{id: '', label: '—'}] : []), ...intervalItems(fields.interval, locale, t)]}
            value={typed ? 'typed' : interval}
            isDisabled={isDisabled}
            onChange={next => set({interval: next === 'typed' ? startTyping(interval) : next})}
          />
          {typed && (
            <Toolbar className="top">
              <NumberField
                isDisabled={isDisabled}
                label={t('nodes.intervalCount')}
                width={120}
                value={numberFromText(typed.count)}
                minValue={0}
                maxValue={Number.MAX_SAFE_INTEGER}
                step={1}
                error={intervalError ?? undefined}
                onChange={count => set({interval: changeTypedInterval(textFromNumber(count), typed.unit)})}
              />
              <LabeledSelect
                label={t('nodes.intervalUnit')}
                items={[
                  {id: 'm', label: t('nodes.minutes')},
                  {id: 'h', label: t('nodes.hours')}
                ]}
                value={typed.unit}
                isDisabled={isDisabled}
                onChange={unit => set({interval: changeTypedInterval(typed.count, unit as 'm' | 'h')})}
              />
            </Toolbar>
          )}
        </>
      )}
      {fields.agent && (
        <TextField
          isDisabled={isDisabled}
          label={t('nodes.agent')}
          value={value.agent}
          placeholder={fields.agent.fallback}
          description={fields.agent.description}
          error={agentError ?? undefined}
          spellCheck={false}
          onChange={agent => set({agent})}
        />
      )}
      {fields.cache !== undefined && (
        <>
          <Switch isSelected={value.cache ?? fields.cache} isDisabled={isDisabled} onChange={cache => set({cache})}>
            {t('nodes.cache')}
          </Switch>
          <span className="rp-label">{t('nodes.cacheHelp')}</span>
        </>
      )}
      {fields.routes && (
        <>
          <LabeledSelect
            label={t('settings.geodataRoute')}
            items={[
              {id: 'routing', label: t('settings.geodataRouteRouting')},
              {id: 'direct', label: t('settings.geodataRouteDirect')},
              // A route naming a group this list lacks is kept, so the select can show it.
              ...[...new Set([...fields.routes, ...(route === 'routing' || route === 'direct' ? [] : [route])])].map(group => ({id: group, label: group}))
            ]}
            value={route}
            isDisabled={isDisabled}
            onChange={next => set({route: next})}
          />
          <span className="rp-label">{t('nodes.routeHelp')}</span>
        </>
      )}
    </>
  );
}
