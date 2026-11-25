Fixed

- Renaming a node also renames the proxy chain hops and group `exit` fields that name it.
- Removing a proxy chain deletes its line from the main configuration, which honk's node API cannot do.
- Removing a node or proxy chain that a group, proxy chain or DNS upstream still names is refused, and the dialog lists those names.
- A node cannot be renamed to the name of a proxy chain.
