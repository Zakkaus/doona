import {Badge} from '@astryxdesign/core/Badge';
import {Card} from '@astryxdesign/core/Card';
import {Divider} from '@astryxdesign/core/Divider';
import {Icon} from '@astryxdesign/core/Icon';
import {HStack, StackItem, VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {Heading, Text} from '@astryxdesign/core/Text';
import {useCallback, useContext} from 'react';
import type {Connection} from './api';
import {docsHref} from './docs';
import {LocaleContext, useMessages} from './i18n';
import {useRead} from './state';
import {Feedback} from './ui';
import {BrandMark} from './ui/BrandMark';
import {RowEntrance} from './ui/motion';

const repository = 'https://github.com/Zakkaus/doona';

export function AboutPanel({connection}: {connection: Connection}) {
  const t = useMessages();
  const locale = useContext(LocaleContext);
  const version = useRead(useCallback(() => connection.api.version(), [connection]));
  const engine = version.data?.engine;
  const rows = [
    {label: t.address, value: connection.address === 'mock' ? t.demoName : connection.address},
    {label: t.aboutBackend, value: engine ? `${engine.name} ${engine.version}` : version.loading ? t.loading : t.unknown}
  ];
  return (
    <VStack gap={4}>
      <HStack gap={3} vAlign="center">
        <Icon icon={BrandMark} size="lg" style={{width: 'var(--spacing-12)', height: 'var(--spacing-12)'}} />
        <VStack gap={1}>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Heading level={2}>{t.app}</Heading>
            <Badge label={`v${import.meta.env.VITE_DOONA_VERSION}`} variant="neutral" />
          </HStack>
          <Text type="supporting" color="secondary">
            {t.aboutTagline}
          </Text>
        </VStack>
      </HStack>
      <HStack gap={4} wrap="wrap">
        <Link href={docsHref(locale)} isExternalLink isStandalone>
          {t.aboutGuide}
        </Link>
        <Link href={repository} isExternalLink isStandalone>
          GitHub
        </Link>
        <Link href={`${repository}/releases`} isExternalLink isStandalone>
          {t.aboutReleases}
        </Link>
      </HStack>
      <VStack gap={3}>
        <Heading level={2}>{t.aboutConnection}</Heading>
        <Card padding={0} width="100%" variant="muted">
          <RowEntrance>
            <VStack as="ul" role="list" gap={0}>
              {rows.map((row, index) => (
                <VStack key={row.label} as="li" gap={0}>
                  {index > 0 && <Divider variant="subtle" />}
                  <HStack padding={4} gap={3} vAlign="start">
                    <StackItem size="fill">
                      <Text type="label">{row.label}</Text>
                    </StackItem>
                    <Text color="secondary" style={{overflowWrap: 'anywhere', minWidth: 0}}>
                      {row.value}
                    </Text>
                  </HStack>
                </VStack>
              ))}
            </VStack>
          </RowEntrance>
        </Card>
        {!!version.error && <Feedback notice={{error: version.error}} />}
      </VStack>
    </VStack>
  );
}
