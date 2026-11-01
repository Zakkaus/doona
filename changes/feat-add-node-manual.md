Added

- The add node dialog has a Manual tab: choose a protocol (including AnyTLS and Juicity) and fill in the server, credentials, security and transport fields, and doona builds the share link, shows it for copying, and adds the node through the same path as a pasted link.
- The add node dialog is now called Add node, since it takes a pasted link or manual fields.
- VMess links with the aes-128-gcm cipher are built in the form honk reads; they were refused as an invalid configuration.
- Pasted links are checked against the schemes honk reads: SOCKS4, SOCKS4a and Hysteria are accepted, and HTTP, HTTPS, SSR and Trojan-Go links, which honk refuses, are rejected up front.
