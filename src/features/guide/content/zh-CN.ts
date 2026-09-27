import type {GuideContent} from '../types';
import * as s from '../snippets';

// Sources are cited beside each fact in en.ts; this file states the same facts.
export const content: GuideContent = {
  interimTitle: '临时指南',
  interim: `doona 依赖 honk 的原生 API。该 API 目前只存在于 Glassyiris/honk 的 \`feat/native-api\` 分支及其滚动发布的 \`debug\` 版本中。本指南已对照 \`${s.honkBuild.release}\`（提交 \`${s.honkBuild.commit}\`）核对。上游 honk 正式发布该 API 之前，配置键与默认值仍可能变化。`,
  sections: [
    {
      id: 'requirements',
      title: '系统要求',
      blocks: [
        {
          kind: 'p',
          text: 'honk 只能在 Linux 上以 `root` 身份运行。它会加载 eBPF 程序、创建 `dae0` 链路与 `daens` 命名空间并修改 sysctl，因此首次启动时请保留控制台等第二条管理通道。'
        },
        {
          kind: 'list',
          items: [
            'Linux 6.12 或更高版本。内核版本过低时，honk 会在挂载任何程序之前拒绝启动。',
            '下列内核选项。桌面与服务器发行版通常已启用；OpenWrt、Armbian 与 VyOS 需要逐项检查。',
            '`pname(...)` 规则需要 cgroup v2。缺少 cgroup v2 时 honk 仍可启动，但按进程名分流不可用。',
            'bpffs 挂载于 `/sys/fs/bpf`。'
          ]
        },
        {kind: 'code', lang: 'sh', text: s.kernelCheck},
        {kind: 'code', lang: 'text', text: s.kernelOptions},
        {kind: 'p', text: '系统未自动挂载 bpffs 时，执行：'},
        {kind: 'code', lang: 'sh', text: s.bpffs}
      ]
    },
    {
      id: 'install',
      title: '安装 honk',
      blocks: [
        {kind: 'p', text: '从 Glassyiris/honk 的 `debug` 版本下载 honk。daeuniverse/honk 的正式版本没有原生 API，访问 `/api` 与 `/ui/` 会返回 404。'},
        {
          kind: 'links',
          items: [
            {href: s.links.honkRelease, text: 'Glassyiris/honk debug 版本'},
            {href: s.links.honkDocs, text: 'honk 快速入门'}
          ]
        },
        {
          kind: 'table',
          head: ['文件', '用途'],
          rows: [
            ['`honk-core-debug-x86_64-unknown-linux-musl.tar.gz`、`…-aarch64-unknown-linux-musl.tar.gz`', '静态链接，适用于网关。无法确定时选择此项。'],
            ['`…-unknown-linux-gnu.tar.gz`', '链接 glibc，适用于常规发行版。'],
            ['`-stock` 后缀', '使用系统内存分配器而非 mimalloc，适用于更重视内存占用的小型设备。']
          ]
        },
        {kind: 'code', lang: 'sh', text: s.installHonk},
        {kind: 'p', text: '二进制文件已内置 eBPF 对象，无需另行安装其他组件。'},
        {kind: 'h', text: '目录与地理数据'},
        {
          kind: 'p',
          text: '创建配置目录与数据目录，然后下载示例规则使用的 geosite 与 geoip 文件。honk 会在 `data_dir` 中查找这两个文件；它们也是 honk 更新地理数据时下载的文件。'
        },
        {kind: 'code', lang: 'sh', text: s.prepareDirs},
        {kind: 'h', text: 'systemd 服务'},
        {kind: 'p', text: '发布包不含 systemd 单元。请创建 `/etc/systemd/system/honk-core.service`：'},
        {kind: 'code', lang: 'ini', text: s.systemdUnit},
        {kind: 'p', text: '完成下一节的配置后，启用并启动服务，然后查看日志：'},
        {kind: 'code', lang: 'sh', text: s.startHonk},
        {
          kind: 'p',
          text: '日志出现 `honk-core is running` 即表示启动完成。请勿添加 `NoNewPrivileges=yes`、能力边界限制或只读 `/proc/sys`，因为启动过程需要 BPF、网络管理、命名空间、挂载与 sysctl 权限。'
        }
      ]
    },
    {
      id: 'config',
      title: '示例配置',
      blocks: [
        {
          kind: 'p',
          text: '配置分为两个文件。主文件 `/etc/honk/config.dae` 包含网卡、节点、组、分流与 DNS；`/etc/honk/config.d/api.dae` 包含 doona 使用的原生 API。主文件引入 `config.d/` 中的全部 `.dae` 文件，相对路径以主文件所在目录为基准。'
        },
        {kind: 'h', text: '主文件'},
        {kind: 'code', lang: 'dae', text: s.mainConfig},
        {
          kind: 'list',
          items: [
            '`lan_interface`：局域网客户端连接网关所用的网卡。`wan_interface: auto` 同时处理网关自身的流量。',
            '`data_dir`：运行时根目录，默认为 `/var/lib/honk`，存放地理数据文件与状态数据库 `state/honk.db`。',
            '`bootstrap_resolver`：直接解析代理服务器与地理数据下载地址的域名，避免被 honk 拦截。下载地址使用域名时必须设置此项。',
            '`subscription` 与 `node`：替换为自己的订阅与节点。之后可在 doona 的节点页继续添加。',
            '`group proxy`：包含订阅中的节点与静态节点；`min_moving_avg` 选择延迟最低的成员。',
            '`routing`：私有地址优先以 `direct(must)` 直连，国内域名与地址直连，其余流量经由 `proxy`。',
            '`dns`：国内域名交给本地解析器，其余经由代理以 DNS over HTTPS 解析。'
          ]
        },
        {kind: 'h', text: 'API 文件'},
        {kind: 'code', lang: 'dae', text: s.apiConfig},
        {
          kind: 'p',
          text: '请将 `192.168.1.1` 替换为网关的局域网地址，并将此配置块单独放在一个文件中。文件在 `native_api` 或 `clash_api` 中包含 `secret`，或包含与 8 个字符以上监听密钥相同的文本时，doona 会将该文件显示为只读，因为 honk 会隐藏密钥，写回文件会丢失密钥。该文件中声明的组同样变为只读。'
        },
        {kind: 'p', text: '添加节点与订阅会写入主文件，因此主文件中不能包含任何密钥。'},
        {kind: 'p', text: '从其他来源打开 doona 时，例如经由 TLS 反向代理，还需添加：'},
        {kind: 'code', lang: 'dae', text: s.apiOptional},
        {
          kind: 'table',
          head: ['字段', '默认值', '在 doona 中启用的功能'],
          rows: [
            ['`enabled`', '`false`', 'API 监听，也是 doona 的全部功能。'],
            ['`listen`', "`'127.0.0.1:9527'`", 'doona 连接的地址，只接受数字 IP 与端口。默认值只能从网关本机访问。'],
            ['`password_auth`', '`false`', '以管理员用户名与密码登录，不能与 `secret` 同时使用。'],
            ['`secret`', "`''`", 'Token 模式，doona 会要求输入此 Token。不能与 `password_auth` 同时使用。'],
            ['`config_write`', '`false`', '编辑与新建配置文件，管理节点、订阅、组与规则，以及更新地理数据。需要 `password_auth` 或 `secret`。'],
            ['`ui`', "`''`", '在 `/ui/` 提供 doona。目录中必须有 `index.html`；目录不存在时 honk 无法启动。'],
            ['`record_flows`', '`true`', '规则页的流程记录。设为 `false` 时运行时开关也无法开启。'],
            ['`record_traffic`', '`true`', '流量历史图表。'],
            ['`record_memory`', '`true`', '内存历史图表。'],
            ['`record_logs`', '`true`', '日志页。'],
            ['`record_dns_log`', '`true`', 'DNS 记录。'],
            ['`geosite_download_url`、`geoip_download_url`', "`''`", '没有状态数据库时的地理数据更新。存在状态数据库时，启动时以这两个地址覆盖已存储的地址。'],
            ['`allow_origins`、`allowed_hosts`', '空', '从其他来源或经由反向代理打开 doona。']
          ]
        },
        {kind: 'p', text: '`native_api` 的每个字段都需要重启才能生效。重载会拒绝对这些字段的修改，并保留正在运行的监听。'},
        {kind: 'h', text: '安装配置文件并启动'},
        {kind: 'code', lang: 'sh', text: s.installConfig},
        {kind: 'p', text: '首次启动时，请执行“安装 honk”一节中的 `systemctl` 命令，而不是重启命令。'},
        {kind: 'h', text: '状态数据库'},
        {
          kind: 'p',
          text: 'honk 默认会打开 `<data_dir>/state/honk.db`：`global.store_subscribe` 默认开启，本示例也启用了 `native_api`。状态数据库没有需要添加的开关，缺失时表示它未能打开。该数据库保存管理员账户、地理数据来源以及 honk 需要持久保存的其他状态。`/var/lib/honk` 必须存在且 root 可写，`honk.db` 必须是普通文件，不能是符号链接。'
        },
        {kind: 'code', lang: 'sh', text: s.stateDbLog},
        {kind: 'p', text: '数据库正常时，第一条命令没有输出。若有输出，请参阅“故障排查”中的“状态数据库问题”。'}
      ]
    },
    {
      id: 'doona',
      title: '安装 doona',
      blocks: [
        {kind: 'p', text: '下载 doona 发布包并解压到 `/usr/share/doona`，即 `ui` 指定的目录。'},
        {kind: 'links', items: [{href: s.links.doonaReleases, text: 'doona 发布页'}]},
        {kind: 'code', lang: 'sh', text: s.installDoona},
        {kind: 'p', text: 'honk 每次请求都从磁盘读取这些文件，因此替换文件后无需重启。'},
        {kind: 'h', text: '首次登录'},
        {
          kind: 'list',
          ordered: true,
          items: [
            '打开 `http://192.168.1.1:9527/ui/`，即 `listen` 地址。doona 会在同一来源找到 API，并将其保存为后端。',
            '密码模式：登录对话框提供首次设置。请在网关本机或局域网设备上创建管理员，然后登录。',
            'Token 模式：输入 `secret` 作为 Token，或打开配对链接。doona 加载后会从地址栏移除 Token。'
          ]
        },
        {kind: 'code', lang: 'text', text: s.pairingLink},
        {kind: 'p', text: '忘记管理员密码时，先停止 honk，再执行 `sudo honk-core admin reset`；下次启动时会重新进入首次设置。'},
        {kind: 'h', text: '从其他来源打开 doona'},
        {
          kind: 'p',
          text: 'doona 由其他服务器提供时，浏览器会发送跨域请求，honk 只接受 `allow_origins` 中列出的来源与 `allowed_hosts` 中列出的主机。请在设置中填写服务器根地址，例如 `http://192.168.1.1:9527`，不要附加 `/api/v1`。'
        },
        {
          kind: 'p',
          text: '通过 HTTPS 加载的页面无法访问纯 HTTP 的 API，浏览器会将其作为混合内容拦截。请从 honk 的 `/ui/` 打开 doona，或将 honk 置于 TLS 反向代理之后。'
        }
      ]
    },
    {
      id: 'features',
      title: '逐项检查功能',
      blocks: [
        {kind: 'p', text: '使用示例配置时，doona 的全部功能均可使用。请按下表逐项确认。'},
        {
          kind: 'table',
          head: ['功能', '正常时的表现', '依赖的配置'],
          rows: [
            ['登录与所有页面', '登录后，活动页显示流量与连接。', '`enabled: true`，以及 `password_auth: true` 或 `secret`'],
            ['配置：编辑文件', '来源列表中的每个文件打开后都没有只读标记，应用后会校验并重载。', '`config_write: true`；文件中不含密钥'],
            ['配置：新建文件', '“新建文件”会创建由主文件 `include` 模式引入的 `.dae` 文件，例如 `config.d/rules.dae`。', '`config_write: true`'],
            ['策略：编辑组', '组卡片提供“编辑”，保存后生效。', '`config_write: true`；组所在文件中不含密钥'],
            ['节点：添加节点与订阅', '节点页提供“粘贴节点链接”与“添加订阅”。', '`config_write: true`；主文件中不含密钥'],
            ['节点：刷新订阅', '每个订阅行都有“刷新”。', '存在 `subscription` 条目，且 honk 的订阅服务正在运行'],
            ['设置：地理数据来源与更新', '地理数据卡片列出来源，“更新”按钮可用。', '状态数据库；`config_write: true`；下载地址；`bootstrap_resolver`'],
            ['设置：后端选项', '后端选项卡片提供流程记录、日志记录与 DNS 记录开关。', '`record_flows`、`record_logs`、`record_dns_log`'],
            ['活动：流量与内存历史', '历史图表在最多 10 分钟内逐步填满。', '`record_traffic`、`record_memory`'],
            ['日志', '打开日志页时持续出现日志。', '`record_logs`'],
            ['DNS：查询、缓存与记录', '列出查询与缓存；打开页面时记录持续增加。', '记录需要 `record_dns_log`；`dns` 配置段'],
            ['连接：关闭', '可以逐条关闭连接，也可以全部关闭。', '`enabled: true`'],
            ['规则：规则列表、流程记录与路由追踪', '规则显示命中次数，出现流程记录，路由追踪可解释指定目标。', '流程记录需要 `record_flows`；`routing` 配置段'],
            ['延迟测试', '节点的“测试”与组的“测试全部”显示延迟。', '`enabled: true`；私有地址目标还需要 `probe_allowed_cidrs`'],
            ['事件', '事件页显示事件流。', '`enabled: true`']
          ]
        },
        {kind: 'p', text: '在自动记录模式下，流程只在需要时记录，日志与 DNS 记录只在有客户端连接时记录。已允许但处于空闲状态的记录器属于正常情况。'},
        {kind: 'h', text: '仍有功能缺失时', id: 'still-missing'},
        {
          kind: 'list',
          items: [
            '修改 `native_api` 后没有重启 honk。重载不会应用这些字段。',
            '缺少 `config_write: true`。`native_api` 的字段直接写在 `experimental` 下时，honk 会以 `unknown experimental setting` 拒绝启动。',
            '既没有 `password_auth: true`，也没有 `secret`。此时若设置了 `config_write: true`，honk 会拒绝启动。',
            '文件包含密钥或与密钥相同的文本，因此 doona 将其显示为只读。',
            '状态数据库未能打开，因此地理数据来源卡片被隐藏。',
            '仅在以 `--store db` 运行时出现，本指南不使用该模式：honk 未能记录的修订会阻止后续写入，直到下一次成功激活配置。'
          ]
        },
        {
          kind: 'links',
          items: [
            {href: '#/guide?section=read-only', text: '只读的配置文件'},
            {href: '#/guide?section=state-db', text: '状态数据库问题'},
            {href: '#/guide?section=unknown-setting', text: 'unknown experimental setting'}
          ]
        }
      ]
    },
    {
      id: 'operation',
      title: '日常维护',
      blocks: [
        {kind: 'h', text: '重载与重启'},
        {kind: 'code', lang: 'sh', text: s.reloadRestart},
        {
          kind: 'p',
          text: '重载会重新读取配置，并在日志中记录 `applied` 或 `rejected`。修改 `native_api`、网卡、TPROXY 设置、`data_dir`、NFQUEUE 开关、DNS 监听或 Clash API 监听后需要重启。doona 的配置页在应用后会自动重载。'
        },
        {kind: 'h', text: '更新 honk'},
        {
          kind: 'p',
          text: '下载新的 `debug` 文件，按“安装 honk”一节安装，然后执行 `sudo systemctl restart honk-core` 并检查 `honk-core --version`。`debug` 标签随每次构建移动，请将版本与本指南注明的版本对照。'
        },
        {kind: 'h', text: '更新 doona'},
        {kind: 'p', text: '将新版本解压到 `/usr/share/doona`，然后在浏览器中重新加载页面。honk 无需重启。'},
        {kind: 'h', text: '更新地理数据'},
        {kind: 'p', text: '在设置的地理数据卡片中点击“更新”，honk 会下载并启用两个文件。自动更新默认关闭，可在同一卡片中开启，每 24 小时检查一次。'},
        {kind: 'h', text: '文件位置'},
        {
          kind: 'table',
          head: ['路径', '内容'],
          rows: [
            ['`/etc/honk/config.dae`', '主配置文件'],
            ['`/etc/honk/config.d/api.dae`', '原生 API 配置块'],
            ['`/var/lib/honk/`', '`data_dir`：地理数据文件与运行时数据'],
            ['`/var/lib/honk/state/honk.db`', '状态数据库'],
            ['`/usr/share/doona/`', '在 `/ui/` 提供的 doona 文件'],
            ['`journalctl -u honk-core`', 'honk 日志']
          ]
        }
      ]
    },
    {
      id: 'troubleshooting',
      title: '故障排查',
      blocks: [
        {kind: 'h', text: 'unknown experimental setting', id: 'unknown-setting'},
        {kind: 'p', text: '`native_api` 的字段直接写在 `experimental` 下，honk 因此拒绝该配置。请将字段移入 `native_api { }`。'},
        {kind: 'code', lang: 'dae', text: s.misplacedField},
        {kind: 'h', text: 'honk 拒绝 native_api 配置块'},
        {
          kind: 'list',
          items: [
            '`configuration administration requires a bearer secret or password login`：`config_write: true` 需要 `password_auth: true` 或 `secret`。',
            '`password login requires an empty secret; a configured secret selects token mode`：两者只能保留一个。',
            '`password login cannot be combined with anonymous loopback`：删除 `allow_anonymous_loopback`。'
          ]
        },
        {kind: 'h', text: '状态数据库问题', id: 'state-db'},
        {kind: 'p', text: '缺少状态数据库时，地理数据来源卡片会消失；只有同时设置两个下载地址，“更新”按钮才会保留。请先在日志中查找原因：'},
        {kind: 'code', lang: 'sh', text: s.stateDbLog},
        {kind: 'code', lang: 'text', text: s.stateDbMessages},
        {
          kind: 'list',
          ordered: true,
          items: [
            'unavailable：`data_dir` 及其 `state/` 目录必须存在，并且运行 honk 的用户可写；使用上文的单元时该用户为 root。',
            'unsafe：`honk.db` 必须是普通文件，不能是符号链接，也不能在 honk 打开时被替换。',
            'locked：等待 `honk-core admin reset` 执行完毕。',
            'corrupt：honk 会将文件移至 `honk.db.corrupt` 并新建数据库。若已存在较早的 `.corrupt` 文件，honk 会保留两者，并在该文件删除之前不使用数据库运行。',
            '修复后重启 honk。'
          ]
        },
        {
          kind: 'p',
          text: '设置 `password_auth: true` 或使用 `--store db` 时，数据库无法打开会使 honk 在启动时退出，日志显示 `state database:` 及原因。`another honk-core has the state database open` 与 `state database has a foreign application id or a newer schema` 总会阻止启动：请停止另一个实例，或使用写入该数据库的 honk 版本。'
        },
        {kind: 'h', text: '固定映射时出现 Invalid argument'},
        {kind: 'p', text: '`/sys/fs/bpf` 不是 bpffs。请按“系统要求”一节挂载。'},
        {kind: 'h', text: '内核版本过低'},
        {
          kind: 'p',
          text: 'honk 会在挂载前拒绝低于 6.12 的内核。验证器拒绝编译后的分流程序时，请使用启用 BPF 与 BTF 的 Linux 6.12 或更高版本，并保留完整的验证器日志以便报告。'
        },
        {kind: 'h', text: '/api 或 /ui/ 返回 404', id: 'no-native-api'},
        {
          kind: 'p',
          text: '`/api` 返回 404 表示正在运行的 honk 没有原生 API，或 `enabled` 不是 `true`；doona 的登录对话框此时显示“此 honk 构建未提供原生 API”。请安装 `debug` 版本。只有 `/ui/` 返回 404 时，表示 `ui` 为空。'
        },
        {kind: 'h', text: '登录与跨域失败', id: 'sign-in'},
        {
          kind: 'list',
          items: [
            '首次设置只能在网关本机或私有网络中的客户端上完成。',
            '设置中显示“网络连接失败”或“网络或跨域请求失败”：无法通过 `listen` 地址访问 honk，或 doona 所在来源未列入 `allow_origins` 与 `allowed_hosts`。',
            '忘记密码：停止 honk，执行 `sudo honk-core admin reset`，再启动 honk 重新设置。',
            'HTTPS 页面无法访问 HTTP API，请参阅“从其他来源打开 doona”。'
          ]
        },
        {kind: 'h', text: '只读的配置文件', id: 'read-only'},
        {kind: 'p', text: '满足下列任一条件时，doona 会将配置文件标记为只读：'},
        {
          kind: 'list',
          items: [
            '`config_write` 不是 `true`。',
            '既没有 `password_auth: true`，也没有 `secret`。',
            '文件在 `native_api` 或 `clash_api` 中包含 `secret`，或包含与 8 个字符以上监听密钥相同的文本。',
            'honk 仍在加载配置文件，或其写入协调器未运行。',
            '仅在以 `--store db` 运行时出现，本指南不使用该模式：已激活的修订未能记录，导致写入被阻止。'
          ]
        },
        {kind: 'p', text: '请将所有密钥移入 `config.d/api.dae`，并在修改 `native_api` 后重启 honk。'}
      ]
    }
  ]
};
