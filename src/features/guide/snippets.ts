// Commands and configuration the setup guide shows, shared by every language. The dae files were parsed and validated
// by honk-config at Glassyiris/honk 5d8f32c1 (the `debug` release) and a5a3711c (feat/native-api); re-check them when
// the pinned honk build changes.

// The honk build this guide was checked against, and the first build with configurable geodata sources. Builds from
// main have no native API; debug.2026.9.24.native-api.* update geodata without configurable sources.
export const honkBuild = {release: 'debug.2026.9.26.native-api.4', commit: '5d8f32c1', geodataSources: 'debug.2026.9.26.native-api.1'};
export const links = {
  honkRelease: 'https://github.com/Glassyiris/honk/releases/tag/debug',
  honkBranch: 'https://github.com/Glassyiris/honk/tree/feat/native-api',
  honkDocs: 'https://github.com/Glassyiris/honk/blob/feat/native-api/doc/en/how-to-start.md',
  doonaReleases: 'https://github.com/Zakkaus/doona/releases'
};

// doc/en/how-to-start.md:13-34
export const kernelCheck = `uname -r
zcat /proc/config.gz 2>/dev/null || cat /boot/config-$(uname -r)`;

// doc/en/how-to-start.md:38-56
export const kernelOptions = `CONFIG_BPF=y
CONFIG_BPF_SYSCALL=y
CONFIG_BPF_JIT=y
CONFIG_CGROUP_BPF=y
CONFIG_NET_CLS_BPF=y|m
CONFIG_NET_SCH_INGRESS=y|m
CONFIG_NET_CLS_ACT=y
CONFIG_NET_NS=y
# Held-first-packet UDP (NFQUEUE, on by default) also needs:
CONFIG_NF_TABLES=y|m
CONFIG_NF_TABLES_INET=y|m
CONFIG_NETFILTER_NETLINK_QUEUE=y|m
CONFIG_NFNETLINK_QUEUE=y|m`;

// doc/en/how-to-start.md:64-74
export const bpffs = `sudo install -d -m 0755 /sys/fs/bpf
mountpoint -q /sys/fs/bpf || sudo mount -t bpf bpf /sys/fs/bpf
mountpoint /sys/fs/bpf
# To mount it at boot, add this line to /etc/fstab:
# bpf /sys/fs/bpf bpf defaults 0 0`;

// Asset names from the `debug` release; the archive holds one directory named after it (.github/workflows/release.yml:80,
// 218-224). Install path from doc/en/how-to-start.md:87-91.
export const installHonk = `TARGET=x86_64-unknown-linux-musl   # or aarch64-unknown-linux-musl, -gnu, and a -stock suffix
curl -fLO https://github.com/Glassyiris/honk/releases/download/debug/honk-core-debug-$TARGET.tar.gz
tar -xzf honk-core-debug-$TARGET.tar.gz
sudo install -m 0755 honk-core-debug-$TARGET/honk-core /usr/local/bin/honk-core
honk-core --version   # prints the tag the build came from, such as ${honkBuild.release}`;

// doc/en/how-to-start.md:174-175, 217-222; the MetaCubeX files are the ones honk's geodata update downloads by default
// (crates/honk-core/src/native_api/geodata/sources.rs:23-28), so an update keeps the same categories.
export const prepareDirs = `sudo install -d -m 0700 /etc/honk /etc/honk/config.d /var/lib/honk
sudo curl -fL --retry 3 -o /var/lib/honk/geosite.dat \\
  https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/release/geosite.dat
sudo curl -fL --retry 3 -o /var/lib/honk/geoip.dat \\
  https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/release/geoip.dat`;

// doc/en/how-to-start.md:228-251, verbatim.
export const systemdUnit = `[Unit]
Description=honk transparent proxy engine
Wants=network-online.target
After=network-online.target

[Service]
Type=notify
User=root
WorkingDirectory=/var/lib/honk
ExecStart=/usr/local/bin/honk-core --config /etc/honk/config.dae --disable-timestamp
ExecReload=/usr/local/bin/honk-core reload
Restart=on-failure
RestartSec=2s
TimeoutStopSec=30s
LimitNOFILE=1048576
LimitMEMLOCK=infinity
UMask=0077

[Install]
WantedBy=multi-user.target`;

// doc/en/how-to-start.md:255-260
export const startHonk = `sudo systemctl daemon-reload
sudo systemctl enable --now honk-core
sudo systemctl status honk-core
sudo journalctl -u honk-core -e`;

// The main file: doc/en/configuration.md:60-195 and doc/en/how-to-start.md:156-209. Includes resolve against the
// entry file's directory (configuration.md:46).
export const mainConfig = `# /etc/honk/config.dae
include {
    config.d/*.dae
}

global {
    # The interface LAN clients reach the gateway through.
    # Remove it to proxy only the gateway's own traffic.
    lan_interface: br-lan
    # Follow the IPv4 default-route interface.
    wan_interface: auto
    data_dir: '/var/lib/honk'
    log_level: info
    dial_mode: domain
    auto_config_kernel_parameter: true
    # Resolves proxy and download hostnames without passing through honk.
    bootstrap_resolver: '1.1.1.1:53'
}

subscription {
    # Replace with your provider's subscription URL.
    my_sub: 'https://subscription.example/sub'
}

node {
    # An optional static node; replace or remove it.
    backup: 'socks5://192.0.2.2:1080'
}

group {
    proxy {
        filter: subtag('my_sub')
        filter: name('backup')
        policy: min_moving_avg
    }
}

routing {
    # Keep private destinations off the proxy; this also bypasses private DNS servers.
    dip(geoip: private) -> direct(must)
    domain(geosite: cn) -> direct
    dip(geoip: cn) -> direct
    fallback: proxy
}

dns {
    upstream {
        local_dns: 'udp://223.5.5.5:53' -> direct
        remote_dns: 'https://dns.google/dns-query' -> proxy
    }
    routing {
        request {
            qname(geosite: cn) -> local_dns
            fallback: remote_dns
        }
    }
}`;

// doc/en/reference/experimental.md:18-63 and api.md:273; defaults from crates/honk-config/src/experimental.rs:148-173.
export const apiConfig = `# /etc/honk/config.d/api.dae
# Every native_api field needs a restart; a reload rejects changes.
experimental {
    native_api {
        enabled: true
        # The gateway's LAN address. The default, 127.0.0.1:9527,
        # is reachable only from the gateway itself.
        listen: '192.168.1.1:9527'
        # Administrator password login. For token mode, delete this
        # line and set secret instead; the two cannot be combined.
        password_auth: true
        # secret: 'replace-with-a-long-random-token'
        config_write: true
        ui: '/usr/share/doona'
        # On by default; listed so the names are known.
        record_flows: true
        record_traffic: true
        record_memory: true
        record_logs: true
        record_dns_log: true
        # Geodata Update works even without a state db. Direct, final
        # HTTP(S) URLs only; a redirect is refused.
        geosite_download_url: 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/release/geosite.dat'
        geoip_download_url: 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/release/geoip.dat'
    }
}`;

// Optional native_api lines: experimental.md:61-63.
export const apiOptional = `experimental {
    native_api {
        # Only when doona is opened from another origin, such as a TLS reverse proxy.
        allow_origins: 'https://panel.example'
        allowed_hosts: 'panel.example'
    }
}`;

// Install the config files after editing them (how-to-start.md:174-175).
export const installConfig = `sudo install -m 0600 config.dae /etc/honk/config.dae
sudo install -m 0600 api.dae /etc/honk/config.d/api.dae`;

// doona README.md:52-60. honk refuses to start while `ui` lacks a readable index.html (native_api/ui.rs:34-52).
export const installDoona = `VERSION=0.1.0-beta.7   # the release you downloaded, without v
sha256sum --ignore-missing -c SHA256SUMS
sudo mkdir -p /usr/share/doona
sudo tar -xzf "doona-\${VERSION}.tar.gz" -C /usr/share/doona
# Optional Noto Sans TC and SC fonts:
if [ -f "doona-fonts-\${VERSION}.tar.gz" ]; then
    sudo tar -xzf "doona-fonts-\${VERSION}.tar.gz" -C /usr/share/doona
fi
ls -l /usr/share/doona/index.html`;

// doona README.md:79-81; the token is removed from the address bar on load.
export const pairingLink = 'http://192.168.1.1:9527/ui/#/settings?api=http://192.168.1.1:9527&token=…';

// doc/en/how-to-start.md:287-298
export const reloadRestart = `sudo systemctl reload honk-core    # re-read the configuration
sudo systemctl restart honk-core   # needed for native_api, interfaces, data_dir
sudo journalctl -u honk-core -e    # look for applied or rejected`;

// State db: crates/honk-core/src/state.rs:76-89, lib.rs:465-495; unit name from how-to-start.md:228. The log keeps
// earlier starts too.
export const stateDbLog = `sudo journalctl -u honk-core | grep -i 'state database'
sudo ls -la /var/lib/honk/state/`;

export const stateDbMessages = `state database is unavailable
state database path is unsafe
state database is locked by \`honk-core admin reset\`
state database is corrupt`;

// A native_api field written directly under experimental: crates/honk-config/src/parser/scalars.rs:570-578.
export const misplacedField = `# Wrong: "unknown experimental setting"
experimental {
    enabled: true
}

# Right
experimental {
    native_api {
        enabled: true
    }
}`;
