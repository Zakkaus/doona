import {defineMessages} from '../../i18n';

export const messages = defineMessages({
  'zh-TW': {
    'event.kind': '種類',
    'event.allKinds': '所有種類',
    'event.unavailable': '不支援事件串流',
    'event.connected': '已連線',
    'event.reconnecting': '重新連線中',
    'event.cursor': '續傳自 {cursor}',
    'event.limit': '顯示最近 200 筆事件，新事件在前。',
    'event.empty': '沒有符合的事件',
    'event.summary': '摘要',
    'event.resource': '{resource}',
    'event.flow': '{id}／修訂 {revision}',
    'event.operation': '{id}／{status}',
    'event.generation': '{previous} → {current}',
    'event.gap': '{id}／{reason}／捨棄記錄 {n}'
  },
  'zh-CN': {
    'event.kind': '种类',
    'event.allKinds': '所有种类',
    'event.unavailable': '不支持事件流',
    'event.connected': '已连接',
    'event.reconnecting': '重新连接中',
    'event.cursor': '续传自 {cursor}',
    'event.limit': '显示最近 200 条事件，新事件在前。',
    'event.empty': '没有匹配的事件',
    'event.summary': '摘要',
    'event.resource': '{resource}',
    'event.flow': '{id}／修订 {revision}',
    'event.operation': '{id}／{status}',
    'event.generation': '{previous} → {current}',
    'event.gap': '{id}／{reason}／丢弃记录 {n}'
  },
  en: {
    'event.kind': 'Kind',
    'event.allKinds': 'All kinds',
    'event.unavailable': 'Event stream unavailable',
    'event.connected': 'Connected',
    'event.reconnecting': 'Reconnecting',
    'event.cursor': 'Resuming from {cursor}',
    'event.limit': 'Showing the latest 200 events, newest first.',
    'event.empty': 'No matching events',
    'event.summary': 'Summary',
    'event.resource': '{resource}',
    'event.flow': '{id} / revision {revision}',
    'event.operation': '{id} / {status}',
    'event.generation': '{previous} → {current}',
    'event.gap': '{id} / {reason} / dropped records {n}'
  }
});
