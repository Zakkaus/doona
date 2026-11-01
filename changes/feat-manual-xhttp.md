Added

- The Manual tab of the add node dialog offers the XHTTP transport for VMess, VLESS and Trojan, with its path, HTTP host and mode.
- The Manual tab has an Advanced section with the options honk reads from a share link: ALPN for TUIC and XHTTP, pinSHA256, ECH config, the Shadowsocks plugin and its options, VLESS packet encoding and mux, the Hysteria2 bandwidth, port hopping, MTU and window settings, and the AnyTLS idle session settings.
- The manual node fields no longer make a link that honk rejects: VLESS flow is offered only over TCP with TLS or REALITY, a REALITY public key is required, and ALPN shows only for TUIC and XHTTP.
