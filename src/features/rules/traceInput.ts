import type {RoutingTraceInput} from '../../api/model';
import {ipLiteral} from '../../api/selectors';

type TraceFields = Pick<RoutingTraceInput, 'network'> & Record<'domain' | 'dst_ip' | 'dst_port' | 'src_ip' | 'src_port' | 'pname' | 'dscp', string>;

export function traceInput(form: TraceFields): RoutingTraceInput {
  // Validation has already required a target and refused invalid IP literals.
  const address = (value: string) => ipLiteral(value)!;
  const input: RoutingTraceInput = {
    network: form.network,
    dst_port: Number(form.dst_port),
    ...(form.domain.trim() ? {domain: form.domain.trim()} : {dst_ip: address(form.dst_ip)})
  };
  if (form.domain.trim() && form.dst_ip.trim()) input.dst_ip = address(form.dst_ip);
  if (form.src_ip.trim()) input.src_ip = address(form.src_ip);
  if (form.src_port.trim()) input.src_port = Number(form.src_port);
  if (form.pname.trim()) input.pname = form.pname.trim();
  if (form.dscp.trim()) input.dscp = Number(form.dscp);
  return input;
}
