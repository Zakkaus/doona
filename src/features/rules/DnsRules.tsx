import {dnsSettingsHref} from '../shared/link';
import {useT} from '../../i18n';
import {Card, Link} from '../../ui/ui';
import type {PageProps} from '../../shell/routes';
import {DnsUpstreams} from './DnsUpstreams';
import {RuleDictionary} from './RuleList';
import {useDnsRuleLinks, useDnsRuleList} from './useDnsRuleList';

// The DNS tab: request rules pick how a query is resolved, response rules what happens to the answer.
export function DnsRules(props: PageProps) {
  const t = useT();
  const request = useDnsRuleList(props, 'request');
  const response = useDnsRuleList(props, 'response');
  const links = useDnsRuleLinks();
  return (
    <div className="rp-col">
      <DnsUpstreams focus={new URLSearchParams(props.query).get('section') === 'upstreams'} />
      {request.addReason && (
        <p className="rp-note">
          {t('rule.dns.noPlace')}{' '}
          <Link appearance="link" href={dnsSettingsHref}>
            {t('dns.openConfig')}
          </Link>
        </p>
      )}
      <Card
        title={request.copy.label}
        note={t('rule.dns.requestNote')}
        aside={
          links.logHref && (
            <span className="rp-cluster">
              {links.logHref && (
                <Link appearance="link" href={links.logHref}>
                  {t('dns.log')}
                </Link>
              )}
            </span>
          )
        }
      >
        <RuleDictionary view={request} />
      </Card>
      <Card title={response.copy.label} note={t('rule.dns.responseNote')}>
        <RuleDictionary view={response} />
      </Card>
    </div>
  );
}
