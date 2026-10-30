Fixed

- Service rules go above regional rules such as `geosite:gfw` and `geosite:cn`, and game services above an all-games rule, so those rules no longer catch the traffic first.
- The service rules dialog shows the outbound of a service's existing rule instead of a checked box, and marks games that an all-games rule already sends to the chosen outbound.
