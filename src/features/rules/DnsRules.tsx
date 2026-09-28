import {useT} from '../../i18n';
import {Card} from '../../ui/ui';
import type {PageProps} from '../../shell/routes';
import {RuleDictionary} from './RuleList';
import {useDnsRuleList} from './useDnsRuleList';

// The DNS tab: request rules pick how a query is resolved, response rules what happens to the answer.
export function DnsRules(props: PageProps) {
  const t = useT();
  const request = useDnsRuleList(props, 'request');
  const response = useDnsRuleList(props, 'response');
  return (
    <div className="rp-col">
      <Card title={request.copy.label} note={t('rule.dns.requestNote')}>
        <RuleDictionary view={request} />
      </Card>
      <Card title={response.copy.label} note={t('rule.dns.responseNote')}>
        <RuleDictionary view={response} />
      </Card>
    </div>
  );
}
