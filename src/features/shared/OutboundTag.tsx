import {useCapabilities, useGroups} from '../../store';
import {offered} from '../../api/capabilities';
import {outboundLabel} from '../../api/selectors';
import {href} from '../../shell/route';
import {useT} from '../../i18n';
import {LinkTag} from '../../ui/ui';

export function OutboundTag({name}: {name: string | null}) {
  const t = useT();
  const capabilities = useCapabilities();
  const groups = useGroups(offered(capabilities.data?.resources, 'groups', {whileLoading: false}));
  const group = groups.data?.find(group => group.name === name);
  return group ? <LinkTag href={href('policies', {group: group.id})}>{group.name}</LinkTag> : outboundLabel(name, t);
}
