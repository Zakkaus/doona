import type {RoutingTraceInput} from '../../api/model';
import {ipLiteral} from '../../api/selectors';

type TraceFields = Pick<RoutingTraceInput, 'network'> & Record<'domain' | 'dst_ip' | 'dst_port' | 'src_ip' | 'src_port' | 'pname' | 'dscp' | 'mark', string>;

// A mark as a dae rule writes it, decimal or 0x hexadecimal, within the contract's unsigned 32 bits.
export const isMark = (value: string) => /^(\d+|0x[\da-f]+)$/i.test(value.trim()) && Number(value.trim()) <= 0xffffffff;

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
  input.pname = form.pname.trim();
  if (form.dscp.trim()) input.dscp = Number(form.dscp);
  if (form.mark.trim()) input.mark = Number(form.mark.trim());
  return input;
}
