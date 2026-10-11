Added

- The node dialog shows a vless or trojan XHTTP link's options as fields: mode, path, host, headers, padding and POST pacing from its extra JSON, and a separate download peer. Editing a field rewrites only that part of the link.
- Saving an edited node link first asks honk to read it, so a link honk would skip is refused with its reason instead of the node silently disappearing.
- Adding a node refuses a link longer than the 8192 characters the API accepts.
