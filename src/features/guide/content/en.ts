import type {GuideContent} from '../types';
import * as s from '../snippets';

// Sources are cited beside each fact: honk paths are in Glassyiris/honk feat/native-api, doona paths in this repository.
export const content: GuideContent = {
  interimTitle: 'Interim guide',
  // README.md:64; snippets.ts honkBuild.
  interim: `doona needs honk's native API, which exists only on the \`feat/native-api\` branch of Glassyiris/honk and its rolling \`debug\` release. This guide was checked against \`${s.honkBuild.release}\` (commit \`${s.honkBuild.commit}\`). Keys and defaults may change before upstream honk releases the API.`,
  sections: [
    {
      id: 'requirements',
      title: 'Requirements',
      blocks: [
        // doc/en/how-to-start.md:7,17-18
        {
          kind: 'p',
          text: 'honk runs on Linux as `root`. It loads eBPF programs, creates the `dae0` link and the `daens` namespace, and changes sysctls, so keep a second way into the machine, such as a console, during the first start.'
        },
        // how-to-start.md:18,36-58
        {
          kind: 'list',
          items: [
            'Linux 6.12 or later. honk rejects an older kernel before it attaches anything.',
            'The kernel options below. Desktop and server distributions usually enable them; OpenWrt, Armbian and VyOS need checking.',
            'cgroup v2 for `pname(...)` rules. Without it honk starts, and process-name routing stays off.',
            'bpffs mounted at `/sys/fs/bpf`.'
          ]
        },
        {kind: 'code', lang: 'sh', text: s.kernelCheck},
        {kind: 'code', lang: 'text', text: s.kernelOptions},
        // how-to-start.md:62-74
        {kind: 'p', text: 'Mount bpffs if the system does not:'},
        {kind: 'code', lang: 'sh', text: s.bpffs},
        {kind: 'h', text: 'honk version'},
        // snippets.ts honkBuild; build.rs:48-55 (the version is the release tag)
        {
          kind: 'list',
          items: [
            `Only builds from the \`feat/native-api\` branch of Glassyiris/honk have the native API: the rolling \`debug\` release, currently built from tag \`${s.honkBuild.release}\` (commit \`${s.honkBuild.commit}\`).`,
            'Builds from main, such as `debug.2026.9.24.1`, have no native API. honk rejects every `native_api` setting as “unknown experimental setting”, and `/api` and `/ui/` answer 404.',
            `Geodata source settings need \`${s.honkBuild.geodataSources}\` or later. \`debug.2026.9.24.native-api.*\` builds update geodata but have no configurable sources.`
          ]
        },
        // lib.rs:218-223; src/shell/Backend.tsx:52
        {
          kind: 'p',
          text: 'Check the running build with `honk-core --version`. doona shows the same version in the Engine card on Overview and at the bottom of the side navigation.'
        }
      ]
    },
    {
      id: 'install',
      title: 'Install honk',
      blocks: [
        // README.md:64; .github/workflows/release.yml:80,180-182
        {
          kind: 'p',
          text: 'Download honk from the `debug` release of Glassyiris/honk. Other builds lack the native API; see honk version under Requirements.'
        },
        {
          kind: 'links',
          items: [
            {href: s.links.honkRelease, text: 'Glassyiris/honk debug release'},
            {href: s.links.honkDocs, text: 'honk quick start'}
          ]
        },
        // how-to-start.md:82-85
        {
          kind: 'table',
          head: ['Asset', 'Use'],
          rows: [
            [
              '`honk-core-debug-x86_64-unknown-linux-musl.tar.gz`, `…-aarch64-unknown-linux-musl.tar.gz`',
              'Static binary for gateways. Choose this one when unsure.'
            ],
            ['`…-unknown-linux-gnu.tar.gz`', 'Linked against glibc, for ordinary distributions.'],
            ['`-stock` suffix', 'The system allocator instead of mimalloc, for small devices where memory use matters more than throughput.']
          ]
        },
        // how-to-start.md:87-93
        {kind: 'code', lang: 'sh', text: s.installHonk},
        {kind: 'p', text: 'The binary embeds the eBPF object; nothing else needs installing.'},
        {kind: 'h', text: 'Directories and geodata'},
        // how-to-start.md:174,215-224; geodata/sources.rs:23-28
        {
          kind: 'p',
          text: 'Create the configuration and data directories, then download the geosite and geoip files that the example rules use. honk finds them in `data_dir`; these are the files its geodata update downloads.'
        },
        {kind: 'code', lang: 'sh', text: s.prepareDirs},
        {kind: 'h', text: 'systemd service'},
        // how-to-start.md:226-262
        {kind: 'p', text: 'The release ships no unit. Create `/etc/systemd/system/honk-core.service`:'},
        {kind: 'code', lang: 'ini', text: s.systemdUnit},
        // native_api/ui.rs:34-52
        {
          kind: 'p',
          text: 'Do not start the service yet. The example configuration serves doona from `/usr/share/doona`, and honk refuses to start until that directory holds `index.html`; Install doona starts honk.'
        },
        {
          kind: 'p',
          text: 'Do not add `NoNewPrivileges=yes`, capability bounding or a read-only `/proc/sys`: startup needs BPF, network administration, namespace, mount and sysctl privileges.'
        }
      ]
    },
    {
      id: 'config',
      title: 'Example configuration',
      blocks: [
        // configuration.md:31-48
        {
          kind: 'p',
          text: 'The configuration is two files. The main file, `/etc/honk/config.dae`, holds interfaces, nodes, groups, routing and DNS. `/etc/honk/config.d/api.dae` holds the native API that doona uses. The main file includes every `.dae` file in `config.d/`; a relative include resolves against the main file’s directory.'
        },
        {kind: 'h', text: 'Main file'},
        {kind: 'code', lang: 'dae', text: s.mainConfig},
        // how-to-start.md:21-26,154,205-209; configuration.md:52,99; groups.md:53
        {
          kind: 'list',
          items: [
            '`lan_interface`: the interface LAN clients reach the gateway through. `wan_interface: auto` also covers the gateway’s own traffic.',
            '`data_dir`: the runtime root, `/var/lib/honk` by default. It holds the geodata files and the state database `state/honk.db`.',
            '`bootstrap_resolver`: resolves proxy server names and geodata download hosts without honk intercepting the query. A download URL with a hostname needs it.',
            '`subscription` and `node`: replace them with your own. doona’s Nodes page adds more later.',
            '`group proxy`: the subscription’s nodes plus the static node; `min_moving_avg` selects the member with the lowest latency.',
            '`routing`: private destinations first with `direct(must)`, then Chinese mainland domains and IP addresses directly, everything else through `proxy`.',
            '`dns`: Chinese mainland domains go to a local resolver, the rest to DNS over HTTPS through the proxy.'
          ]
        },
        {kind: 'h', text: 'API file'},
        {kind: 'code', lang: 'dae', text: s.apiConfig},
        // native_api/config.rs:43,138-140,463-495; parser/sources.rs:378-395
        {
          kind: 'p',
          text: 'Replace `192.168.1.1` with the gateway’s LAN address. Keep this block in its own file. doona shows a file as read-only when it contains a `secret` inside `native_api` or `clash_api`, or any text equal to a listener secret of 8 or more characters, because honk hides the secret and writing the file back would lose it. Groups declared in that file become read-only too.'
        },
        // native_api/config.rs:370-382
        {kind: 'p', text: 'Adding nodes and subscriptions writes to the main file, so the main file must not contain any secret.'},
        // experimental.md:59-63
        {kind: 'p', text: 'When doona is opened from another origin, such as a TLS reverse proxy, also add:'},
        {kind: 'code', lang: 'dae', text: s.apiOptional},
        // experimental.md:18-41; experimental.rs:148-173,199-211; api.md:273,284; lib.rs:469-493
        {
          kind: 'table',
          head: ['Field', 'Default', 'What it enables in doona'],
          rows: [
            ['`enabled`', '`false`', 'The API listener, and so all of doona.'],
            ['`listen`', "`'127.0.0.1:9527'`", 'The address doona connects to. A numeric IP and a port; the default is reachable only from the gateway.'],
            ['`password_auth`', '`false`', 'Sign-in with an administrator username and password. Cannot be combined with `secret`.'],
            ['`secret`', "`''`", 'Token mode: doona asks for this token. Cannot be combined with `password_auth`.'],
            [
              '`config_write`',
              '`false`',
              'Editing and adding sources, managing nodes, subscriptions, groups and rules, and geodata updates. Requires `password_auth` or `secret`.'
            ],
            ['`ui`', "`''`", 'Serves doona at `/ui/`. The directory must hold `index.html`; a missing directory stops startup.'],
            ['`record_flows`', '`true`', 'Flow records on the Rules page. `false` also disables the runtime switch.'],
            ['`record_traffic`', '`true`', 'Traffic history charts.'],
            ['`record_memory`', '`true`', 'Memory history charts.'],
            ['`record_logs`', '`true`', 'The Logs page.'],
            ['`record_dns_log`', '`true`', 'The DNS log.'],
            [
              '`geosite_download_url`, `geoip_download_url`',
              "`''`",
              'Geodata Update without a state database. With one, these URLs replace the stored ones at startup.'
            ],
            ['`allow_origins`, `allowed_hosts`', 'empty', 'doona served from another origin or through a reverse proxy.']
          ]
        },
        // experimental.md:18
        {kind: 'p', text: 'Every `native_api` field needs a restart. A reload rejects a change to one and keeps the running listener.'},
        {kind: 'h', text: 'Install the files'},
        {kind: 'code', lang: 'sh', text: s.installConfig},
        {kind: 'p', text: 'Install doona next; honk starts after that.'}
      ]
    },
    {
      id: 'doona',
      title: 'Install doona and start',
      blocks: [
        // README.md:48-60; native_api/ui.rs:34-52
        {
          kind: 'p',
          text: 'Download a doona release and extract it into `/usr/share/doona`, the directory `ui` names. The last command must list `index.html`; without it honk does not start.'
        },
        {kind: 'links', items: [{href: s.links.doonaReleases, text: 'doona releases'}]},
        {kind: 'code', lang: 'sh', text: s.installDoona},
        // native_api/ui.rs:61-65,119-125
        {kind: 'p', text: 'honk reads these files from disk on each request, so replacing them later needs no restart.'},
        {kind: 'h', text: 'Start honk'},
        // how-to-start.md:255-262
        {kind: 'p', text: 'Enable and start the service, then read its log:'},
        {kind: 'code', lang: 'sh', text: s.startHonk},
        {kind: 'p', text: 'honk is ready when the log shows `honk-core is running`.'},
        {kind: 'h', text: 'State database'},
        // state.rs:113-135,451-468; lib.rs:465-495; honk-config config.rs:333 (store_subscribe defaults to true)
        {
          kind: 'p',
          text: 'honk opens `<data_dir>/state/honk.db` by default: `global.store_subscribe` is on unless turned off, and `native_api` is enabled here. There is no switch to add. The database keeps the administrator account, the geodata sources and other state honk persists. honk creates `state/` and `honk.db` itself; `/var/lib/honk` must exist and be writable by root.'
        },
        {
          kind: 'p',
          text: 'With `password_auth: true`, as in this example, honk does not start when the database cannot be opened, so a running honk has it open. In token mode honk starts without it and logs a warning; a missing state database then means it failed to open. Either way, State database problems in Troubleshooting explains the log messages.'
        },
        {kind: 'h', text: 'First sign-in'},
        // README.md:75-81; docs/guide.md:41-43
        {
          kind: 'list',
          ordered: true,
          items: [
            'Open `http://192.168.1.1:9527/ui/`, the `listen` address. doona finds the API on the same origin and saves it as a backend.',
            'Password mode: the sign-in dialog offers first-time setup. Create the administrator from the gateway or a device on the LAN, then sign in.',
            'Token mode: enter the `secret` as the token, or open a pairing link. doona removes the token from the address bar after loading.'
          ]
        },
        {kind: 'code', lang: 'text', text: s.pairingLink},
        // reference/cli.md:55
        {kind: 'p', text: 'To replace a forgotten administrator, stop honk and run `sudo honk-core admin reset`; the next start opens setup again.'},
        {kind: 'h', text: 'doona on another origin'},
        // experimental.md:61-63; docs/guide.md:26-28
        {
          kind: 'p',
          text: 'When doona is served elsewhere, the browser sends cross-origin requests, and honk accepts only origins listed in `allow_origins` and hosts listed in `allowed_hosts`. In Settings, enter the server root, such as `http://192.168.1.1:9527`, without `/api/v1`.'
        },
        // Browser mixed-content blocking; not stated in honk or doona documentation.
        {
          kind: 'p',
          text: 'A page loaded over HTTPS cannot call an API over plain HTTP; browsers block it as mixed content. Open doona from honk at `/ui/`, or put honk behind a TLS reverse proxy.'
        }
      ]
    },
    {
      id: 'features',
      title: 'Check every feature',
      blocks: [
        // how-to-start.md:186,283
        {
          kind: 'p',
          text: 'First confirm that the gateway carries traffic. Replace the example subscription and node with working ones, then from a real LAN client test direct and proxied TCP, UDP and DNS. `honk-core is running`, the `dae0` link or a reachable API does not prove that traffic flows.'
        },
        {kind: 'p', text: 'With the example configuration, every doona feature works. Check each one against this list.'},
        // limits in api.md; config.rs:364-382,463-495; geodata.rs:125-149,250-255; experimental.md:28-33; settings.rs:100-124
        {
          kind: 'table',
          head: ['Feature', 'Works when', 'Depends on'],
          rows: [
            ['Sign-in and every page', 'After sign-in, Activity shows traffic and connections.', '`enabled: true`, and `password_auth: true` or `secret`'],
            [
              'Configuration: edit sources',
              'Every file in the source picker opens without a read-only mark, and Save validates and reloads.',
              '`config_write: true`; the file contains no secret'
            ],
            [
              'Configuration: new files',
              'New file creates a `.dae` file that an `include` pattern of the main file loads, such as `config.d/rules.dae`.',
              '`config_write: true`'
            ],
            ['Policies: edit groups', 'A group card offers Edit, and saving applies it.', '`config_write: true`; the group’s file contains no secret'],
            [
              'Nodes: add nodes and subscriptions',
              'The Nodes page offers Paste node link and Add subscription.',
              '`config_write: true`; the main file contains no secret'
            ],
            ['Nodes: refresh subscriptions', 'Each subscription row has Refresh.', 'A `subscription` entry, and honk’s subscription service running'],
            [
              'Settings: geodata sources and Update',
              'The Geodata card lists sources, and Update is enabled.',
              `honk \`${s.honkBuild.geodataSources}\` or later; the state database; \`config_write: true\`; download URLs; \`bootstrap_resolver\``
            ],
            [
              'Settings: backend options',
              'The Backend options card has switches for flow recording, log recording and the DNS log.',
              '`record_flows`, `record_logs`, `record_dns_log`'
            ],
            ['Activity: traffic and memory history', 'The history charts fill over up to 10 minutes.', '`record_traffic`, `record_memory`'],
            ['Logs', 'Log lines appear while the page is open.', '`record_logs`'],
            [
              'DNS: queries, cache and log',
              'Queries and the cache are listed; the log fills while the page is open.',
              '`record_dns_log` for the log; the `dns` section'
            ],
            ['Connections: close', 'Rows can be closed one by one or all at once.', '`enabled: true`'],
            [
              'Rules: rule list, flows and Trace simulation',
              'Rules show hits, flow records appear, and Trace simulation explains a chosen target.',
              '`record_flows` for flows; the `routing` section'
            ],
            ['Latency tests', 'Test on a node and Test all on a group show latency.', '`enabled: true`; a private target also needs `probe_allowed_cidrs`'],
            ['Events', 'The Events page shows the event stream.', '`enabled: true`']
          ]
        },
        // settings.rs:100-124; src/features/settings/messages.ts settings.record.auto
        {
          kind: 'p',
          text: 'In the default With panel mode, flow recording runs on demand, and log recording and the DNS log run only while a panel is attached. A recorder that is allowed but idle is normal.'
        },
        {kind: 'h', text: 'If a feature is still missing', id: 'still-missing'},
        {
          kind: 'list',
          items: [
            'honk was not restarted after `native_api` changed. A reload does not apply these fields.',
            '`config_write: true` is absent. A `native_api` field written directly under `experimental` stops honk with “unknown experimental setting”.',
            'Neither `password_auth: true` nor `secret` is set. With `config_write: true`, honk then refuses to start.',
            'The file contains a secret or text equal to one, so doona shows it read-only.',
            `honk is older than \`${s.honkBuild.geodataSources}\`, so the Geodata card has no source settings.`,
            'In token mode, the state database did not open, so the geodata sources card is hidden.',
            'Only when honk runs with `--store db`, which this guide does not use: a revision honk could not record blocks writes until the next successful activation.'
          ]
        },
        {
          kind: 'links',
          items: [
            {href: '#/guide?section=read-only', text: 'Read-only sources'},
            {href: '#/guide?section=state-db', text: 'State database problems'},
            {href: '#/guide?section=unknown-setting', text: 'unknown experimental setting'}
          ]
        }
      ]
    },
    {
      id: 'operation',
      title: 'Everyday operation',
      blocks: [
        {kind: 'h', text: 'Reload and restart'},
        {kind: 'code', lang: 'sh', text: s.reloadRestart},
        // how-to-start.md:293; experimental.md:18
        {
          kind: 'p',
          text: 'A reload re-reads the configuration and logs `applied` or `rejected`. Changes to `native_api`, interfaces, TPROXY settings, `data_dir`, the NFQUEUE switch, the DNS listener or the Clash API listener need a restart. doona’s Configuration page reloads by itself after saving.'
        },
        {kind: 'h', text: 'Update honk'},
        {
          kind: 'p',
          text: 'Download the new `debug` asset, install it as in Install honk, then run `sudo systemctl restart honk-core` and check `honk-core --version`. The `debug` tag moves with every build, so compare the version with the one this guide names.'
        },
        {kind: 'h', text: 'Update doona'},
        // native_api/ui.rs:61-65
        {kind: 'p', text: 'Extract the new release into `/usr/share/doona` and reload the page in the browser. honk needs no restart.'},
        {kind: 'h', text: 'Update geodata'},
        // api.md:273,284; geodata/sources.rs:43-50
        {
          kind: 'p',
          text: 'Settings, Geodata, Update downloads both files and activates them. Automatic updates are on by default and check every 24 hours; the same card turns them off or changes the interval.'
        },
        {kind: 'h', text: 'Where things live'},
        {
          kind: 'table',
          head: ['Path', 'Contents'],
          rows: [
            ['`/etc/honk/config.dae`', 'Main configuration'],
            ['`/etc/honk/config.d/api.dae`', 'Native API block'],
            ['`/var/lib/honk/`', '`data_dir`: geodata files and runtime data'],
            ['`/var/lib/honk/state/honk.db`', 'State database'],
            ['`/usr/share/doona/`', 'doona files served at `/ui/`'],
            ['`journalctl -u honk-core`', 'honk’s log']
          ]
        }
      ]
    },
    {
      id: 'troubleshooting',
      title: 'Troubleshooting',
      blocks: [
        {kind: 'h', text: 'unknown experimental setting', id: 'unknown-setting'},
        // parser/scalars.rs:570-578
        {kind: 'p', text: 'honk refuses the configuration because a `native_api` field sits directly under `experimental`. Move it into `native_api { }`.'},
        {kind: 'code', lang: 'dae', text: s.misplacedField},
        {
          kind: 'p',
          text: 'A build from main rejects every `native_api` setting this way, even inside `native_api { }`. Check `honk-core --version` and install the `debug` build; see honk version under Requirements.'
        },
        {kind: 'h', text: 'honk refuses the native_api block'},
        // experimental.rs:199-218
        {
          kind: 'list',
          items: [
            '“configuration administration requires a bearer secret or password login”: `config_write: true` needs `password_auth: true` or `secret`.',
            '“password login requires an empty secret; a configured secret selects token mode”: remove one of the two.',
            '“password login cannot be combined with anonymous loopback”: remove `allow_anonymous_loopback`.'
          ]
        },
        {kind: 'h', text: 'State database problems', id: 'state-db'},
        // geodata.rs:125-149,250-255; state.rs:76-89; lib.rs:465-495
        {
          kind: 'p',
          text: 'With `password_auth: true`, as in this example, a database that cannot be opened stops honk at startup, and the log shows `state database:` with the reason. In token mode honk logs a warning and runs without it: the geodata sources card disappears, and Update remains only when both download URLs are set. Find the cause in the log:'
        },
        {kind: 'code', lang: 'sh', text: s.stateDbLog},
        {kind: 'p', text: 'The log also keeps messages from earlier starts; read the lines from the latest start.'},
        {kind: 'code', lang: 'text', text: s.stateDbMessages},
        // state.rs:344-410,451-468,658-669
        {
          kind: 'list',
          ordered: true,
          items: [
            'unavailable: `data_dir` must exist and be writable by the user honk runs as, root with the unit above. honk creates `state/` itself.',
            'unsafe: `state/` and `honk.db` must belong to that user and grant no group or other permissions. `honk.db` must be a regular file, not a symbolic link or a file replaced while honk opened it.',
            'locked: wait for `honk-core admin reset` to finish.',
            'corrupt: with `password_auth: true` honk stops. In token mode honk moves the file to `honk.db.corrupt` and starts a new one; if an older `.corrupt` file is already there, honk keeps both and runs without the database until that file is removed.',
            'Restart honk after the fix.'
          ]
        },
        {
          kind: 'p',
          text: '“another honk-core has the state database open” and “state database has a foreign application id or a newer schema” always stop startup: stop the other instance, or run the honk build that wrote the database.'
        },
        {kind: 'h', text: 'Pinning a map fails with Invalid argument'},
        // how-to-start.md:345
        {kind: 'p', text: '`/sys/fs/bpf` is not bpffs. Mount it as shown in Requirements.'},
        {kind: 'h', text: 'Kernel too old'},
        // how-to-start.md:18,344
        {
          kind: 'p',
          text: 'honk rejects kernels older than 6.12 before attaching. When the verifier rejects compiled routing, use Linux 6.12 or later with BPF and BTF, and keep the full verifier log for a report.'
        },
        {kind: 'h', text: 'No native API, or 404 on /api or /ui/', id: 'no-native-api'},
        // README.md:64; experimental.md:21,28; native_api/ui.rs:23-52
        {kind: 'p', text: 'Check the running build with `honk-core --version` against honk version under Requirements.'},
        {
          kind: 'list',
          items: [
            'The connection to the `listen` address fails: honk is not running, `enabled` is not `true`, or `listen` names another address. With `enabled: false` the listener does not start.',
            '`/api` returns 404: the server at that address has no native API, such as a honk build from main. doona’s sign-in dialog then says “This honk build has no native API”. Install the `debug` build.',
            '`/ui/` alone returns 404: the native API runs, but `ui` is empty.',
            'honk stops at startup with “failed to inspect native UI directory” or “native UI index.html must be a regular file”: extract doona into the `ui` directory, as in Install doona and start.'
          ]
        },
        {kind: 'h', text: 'Sign-in and cross-origin failures', id: 'sign-in'},
        // README.md:75-81; experimental.md:59-63; src/features/settings/messages.ts:327-328
        {
          kind: 'list',
          items: [
            'First-time setup works only from the gateway or a private-network client.',
            '“Network connection failed” or “Network or CORS request failed” in Settings: honk is not reachable at the `listen` address, or doona runs on an origin missing from `allow_origins` and `allowed_hosts`.',
            'A forgotten password: stop honk, run `sudo honk-core admin reset`, and start honk to set up again.',
            'An HTTPS page cannot reach an HTTP API; see doona on another origin.'
          ]
        },
        {kind: 'h', text: 'Read-only sources', id: 'read-only'},
        // native_api/config.rs:364-382,463-479; config/revisions.rs:30-36; store/db.rs:489-500
        {kind: 'p', text: 'doona marks a source read-only when any of these holds:'},
        {
          kind: 'list',
          items: [
            '`config_write` is not `true`.',
            'Neither `password_auth: true` nor `secret` is set.',
            'The file contains a `secret` inside `native_api` or `clash_api`, or text equal to a listener secret of 8 or more characters.',
            'honk is still loading its sources or its write coordinator is not running.',
            'Only with `--store db`, which this guide does not use: an activated revision could not be recorded, which blocks writes.'
          ]
        },
        {kind: 'p', text: 'Move every secret into `config.d/api.dae`, and restart honk after changing `native_api`.'}
      ]
    }
  ]
};
