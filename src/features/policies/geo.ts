// Name-based region guesses are only for grouping and filtering, not geolocation.
const TABLE: Array<[string, string[]]> = [
  ['HK', ['hk', 'hkg', 'hongkong', 'hong kong', '香港', '港']],
  ['TW', ['tw', 'tpe', 'taiwan', 'taipei', '台灣', '台湾', '臺灣', '台北']],
  ['JP', ['jp', 'jpn', 'japan', 'tokyo', 'osaka', 'nrt', 'hnd', 'kix', '日本', '東京', '东京', '大阪']],
  ['SG', ['sg', 'sgp', 'singapore', 'sin', '新加坡', '獅城', '狮城']],
  ['KR', ['kr', 'kor', 'korea', 'seoul', 'icn', '韓國', '韩国', '首爾', '首尔']],
  [
    'US',
    [
      'us',
      'usa',
      'united states',
      'america',
      'lax',
      'sjc',
      'sea',
      'nyc',
      'los angeles',
      'san jose',
      'seattle',
      '美國',
      '美国',
      '洛杉磯',
      '洛杉矶',
      '聖何塞',
      '圣何塞',
      '西雅圖',
      '西雅图'
    ]
  ],
  ['CA', ['can', 'canada', 'toronto', 'yyz', '加拿大']],
  ['GB', ['gb', 'uk', 'united kingdom', 'britain', 'london', 'lhr', '英國', '英国', '倫敦', '伦敦']],
  ['DE', ['de', 'deu', 'germany', 'frankfurt', 'fra', '德國', '德国', '法蘭克福', '法兰克福']],
  ['FR', ['fr', 'fra', 'france', 'paris', 'cdg', '法國', '法国', '巴黎']],
  ['NL', ['nl', 'nld', 'netherlands', 'amsterdam', 'ams', '荷蘭', '荷兰', '阿姆斯特丹']],
  ['RU', ['ru', 'rus', 'russia', 'moscow', '俄羅斯', '俄罗斯', '莫斯科']],
  ['AU', ['au', 'aus', 'australia', 'sydney', 'syd', '澳洲', '澳大利亞', '澳大利亚', '悉尼']],
  ['IN', ['in', 'ind', 'india', 'mumbai', 'bom', '印度', '孟買', '孟买']],
  ['TR', ['tr', 'tur', 'turkey', 'türkiye', 'istanbul', '土耳其']],
  ['BR', ['br', 'bra', 'brazil', 'sao paulo', 'gru', '巴西']],
  ['AR', ['ar', 'arg', 'argentina', '阿根廷']],
  ['MY', ['my', 'mys', 'malaysia', 'kul', '馬來西亞', '马来西亚']],
  ['TH', ['th', 'tha', 'thailand', 'bangkok', 'bkk', '泰國', '泰国']],
  ['VN', ['vn', 'vnm', 'vietnam', '越南']],
  ['PH', ['ph', 'phl', 'philippines', 'manila', '菲律賓', '菲律宾']],
  ['ID', ['id', 'idn', 'indonesia', 'jakarta', '印尼']],
  ['AE', ['ae', 'are', 'uae', 'dubai', 'dxb', '阿聯', '阿联', '杜拜', '迪拜']],
  ['CH', ['ch', 'che', 'switzerland', 'zurich', '瑞士']],
  ['SE', ['se', 'swe', 'sweden', 'stockholm', '瑞典']],
  ['FI', ['fi', 'fin', 'finland', 'helsinki', '芬蘭', '芬兰']],
  ['IT', ['it', 'ita', 'italy', 'milan', '義大利', '意大利']],
  ['ES', ['es', 'esp', 'spain', 'madrid', '西班牙']],
  ['PL', ['pl', 'pol', 'poland', 'warsaw', '波蘭', '波兰']],
  ['MO', ['mo', 'mac', 'macau', 'macao', '澳門', '澳门']],
  ['CN', ['cn', 'chn', 'china', 'shanghai', 'beijing', 'shenzhen', '中國', '中国', '上海', '北京', '深圳']]
];
const ASCII = /[a-z0-9]+/g;

export function regionOf(name: string): string | null {
  const lower = name.toLowerCase();
  const tokens = new Set(lower.match(ASCII) ?? []);
  for (const [iso, keys] of TABLE) {
    for (const k of keys) {
      if (/^[a-z0-9 ]+$/.test(k)) {
        if (tokens.has(k) || (k.includes(' ') && lower.includes(k))) return iso;
      } else if (name.includes(k)) return iso;
    }
  }
  return null;
}
