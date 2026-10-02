import {LinkTag} from '../../ui/ui';
import type {OutboundTagView} from './link';

export function OutboundTag({label, href}: OutboundTagView) {
  return href ? <LinkTag href={href}>{label}</LinkTag> : label;
}
