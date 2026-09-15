import {defineMessages} from '../../i18n';

export const messages = defineMessages({
  'zh-TW': {
    'client.note':
      '依連線資料的來源位址彙整。API 提供來源、目的位址與域名，不提供 MAC 或首次見到時間。下載合計僅涵蓋目前可見連線；首次見到由本頁在本次瀏覽器工作階段記錄，不持久保存。',
    'client.truncated': '連線資料已截斷，合計可能不完整。',
    'client.empty': '目前沒有客戶端',
    'client.active': '活動連線',
    'client.download': '下載合計',
    'client.firstSeen': '首次見到'
  },
  'zh-CN': {
    'client.note':
      '按连接数据的来源地址汇总。API 提供来源、目标地址和域名，不提供 MAC 或首次发现时间。下载总计仅涵盖当前可见连接；首次发现时间由本页在本次浏览器会话中记录，不持久保存。',
    'client.truncated': '连接数据已截断，总计可能不完整。',
    'client.empty': '当前没有客户端',
    'client.active': '活动连接',
    'client.download': '下载总计',
    'client.firstSeen': '首次发现'
  },
  en: {
    'client.note':
      'Grouped by source address. The API provides source and destination addresses and domains, but no MAC or first-seen time. Download totals cover currently visible connections only. First-seen times are recorded for this browser session and are not persisted.',
    'client.truncated': 'Connection data is truncated; totals may be incomplete.',
    'client.empty': 'No clients',
    'client.active': 'Active connections',
    'client.download': 'Downloaded',
    'client.firstSeen': 'First seen'
  }
});
