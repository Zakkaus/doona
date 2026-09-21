import type {LogRecord} from '../../model';
export const logSeed: Array<Pick<LogRecord, 'level' | 'target' | 'message'> & {fields?: LogRecord['fields']}> = [
  {level: 'info', target: 'honk::main', message: 'honk 0.9.3 starting.', fields: {pid: 4120}},
  {level: 'info', target: 'honk::config', message: 'Configuration accepted.', fields: {sources: 4, generation_id: '40'}},
  {level: 'info', target: 'honk::subscription', message: 'Subscription loaded.', fields: {provider: 'sub-c', nodes: 100}},
  {level: 'warn', target: 'honk::subscription', message: 'Subscription served from cache.', fields: {provider: 'sub-c', age_seconds: 1800}},
  {level: 'info', target: 'honk::datapath', message: 'Kernel datapath attached.', fields: {interface: 'br-lan'}},
  {level: 'info', target: 'honk::dns', message: 'DNS listener bound.', fields: {bind: '127.0.0.1:5353'}},
  {level: 'info', target: 'honk::routing', message: 'Routing generation published.', fields: {generation_id: '40'}},
  {level: 'error', target: 'honk::group', message: 'Health check failed.', fields: {node: 'jp-01', error: 'connect timeout'}},
  {level: 'info', target: 'honk::api', message: 'Native API listening.', fields: {listen: '127.0.0.1:9090'}}
];
