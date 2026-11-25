Added

- The Add node dialog has a Proxy chain mode that picks 2 to 4 existing nodes from entry to exit, checks each hop's position against its protocol, and writes the chain to the main configuration file. A chain's Edit action opens the same fields, and a rename updates the groups that name it.
- Node details list a proxy chain's hops with their protocol and latency, flag a hop that names no node or several, and say whether UDP is ruled out by protocol or depends on node settings.
- Proxy chains show as "Proxy chain" in the node list and can be tested by HTTP and DNS. A group TCP connect test no longer counts a chain member as a failure.
- honk's proxy chain diagnostics read in the page language where a configuration write is refused.
