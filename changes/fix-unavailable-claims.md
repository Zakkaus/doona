Fixed

- Rule templates refuse a file only when its experimental native_api or clash_api section holds a secret or a nested section, as honk does, rather than whenever such a section exists.
- System status no longer says that flows set to Off are recorded on demand; it tells the Off mode in Settings apart from recording on demand and from a configuration that forbids recording.
- Geodata hints name the assets.geodata.geosite and assets.geodata.geoip keys in an assets section, and say that honk refuses them together with the older experimental.native_api download URL keys.
- A source whose text does not match its hash is described as incomplete, and as redacted only when the backend masked listener secrets.
