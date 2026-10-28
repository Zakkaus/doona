import {HoverCard} from '@astryxdesign/core/HoverCard';
import {VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {LoadingText} from './LoadingText';
import * as stylex from '@stylexjs/stylex';
import {useContext} from 'react';
import {LocaleContext, useMessages} from '../i18n';
import {focusRing} from './focusRing';
import {RowTooltip as Tooltip} from './RowTooltip';

type DateStampProps = {value: string | null | undefined; plain?: boolean; relative?: boolean; loading?: boolean};
export function DateStamp({value, plain = false, relative = false, loading}: DateStampProps) {
  const locale = useContext(LocaleContext);
  const t = useMessages();
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime()))
    return <LoadingText type={plain ? 'supporting' : undefined} color={plain ? 'secondary' : undefined} loading={loading} children={t.unknown} />;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const full = (timeZone: string) => new Intl.DateTimeFormat(locale, {dateStyle: 'long', timeStyle: 'long', timeZone}).format(date);
  if (relative) {
    const seconds = (date.getTime() - Date.now()) / 1000;
    const units = [
      ['year', 31536000],
      ['month', 2592000],
      ['day', 86400],
      ['hour', 3600],
      ['minute', 60],
      ['second', 1]
    ] as const;
    const [unit, size] = units.find(([, size]) => Math.abs(seconds) >= size) ?? units[units.length - 1];
    const time = new Intl.RelativeTimeFormat(locale).format(Math.round(seconds / size), unit);
    return (
      <Tooltip content={full(zone)}>
        <LoadingText type="supporting" color="secondary" textWrap="wrap" hasTabularNumbers loading={loading}>
          <time dateTime={date.toISOString()} tabIndex={0} {...stylex.props(focusRing)}>
            {t.subscriptionUpdated.replace('{time}', time)}
          </time>
        </LoadingText>
      </Tooltip>
    );
  }
  if (plain)
    return (
      <Text type="supporting" color="secondary" textWrap="nowrap" hasTabularNumbers>
        <time dateTime={date.toISOString()} title={full(zone)}>
          {new Intl.DateTimeFormat(locale, {year: 'numeric', month: '2-digit', day: '2-digit'}).format(date)}
        </time>
      </Text>
    );
  return (
    <Text textWrap="nowrap" hasTabularNumbers>
      <HoverCard
        placement="below"
        alignment="start"
        focusTrigger="always"
        touchTrigger="tap"
        hasHoverIndication
        label={t.lastUpdate}
        content={
          <VStack gap={3}>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">
                {zone}
              </Text>
              <Text textWrap="wrap">{full(zone)}</Text>
            </VStack>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">
                UTC
              </Text>
              <Text textWrap="wrap">{full('UTC')}</Text>
            </VStack>
          </VStack>
        }
      >
        <time dateTime={date.toISOString()} tabIndex={0} {...stylex.props(focusRing)}>
          {new Intl.DateTimeFormat(locale, {year: 'numeric', month: '2-digit', day: '2-digit'}).format(date)}
        </time>
      </HoverCard>
    </Text>
  );
}
