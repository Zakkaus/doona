import type {LogRecord} from '../../model';
export const logSeed: Array<Pick<LogRecord, 'level' | 'target' | 'message'> & {fields?: LogRecord['fields']}> = [
  {level: 'info', target: 'honk::main', message: 'Runtime snapshot captured.', fields: {pid: 1842}},
  {level: 'info', target: 'honk::config', message: 'Configuration state checked.', fields: {sources: 4, generation_id: '40'}},
  {level: 'info', target: 'honk::subscription', message: 'Subscription status checked.', fields: {provider: 'sub-c'}},
  {level: 'warn', target: 'honk::subscription', message: 'Subscription served from cache.', fields: {provider: 'sub-c', age_seconds: 1800}},
  {level: 'warn', target: 'honk::datapath', message: 'Routing map sample delayed.', fields: {interface: 'lan0'}},
  {level: 'info', target: 'honk::dns', message: 'DNS listener healthy.', fields: {bind: '127.0.0.1:5353'}},
  {level: 'info', target: 'honk::routing', message: 'Routing generation checked.', fields: {generation_id: '40'}},
  {level: 'error', target: 'honk::group', message: 'Health check failed.', fields: {node: 'jp-01', error: 'connect timeout'}},
  {level: 'info', target: 'honk::api', message: 'Native API request served.', fields: {listen: '127.0.0.1:9090'}}
];
