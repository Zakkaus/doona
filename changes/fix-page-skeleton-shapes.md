Fixed

- A page's first-load skeleton now starts where the loaded page does: a direct load draws the page's heading and its own skeleton shape instead of a generic pair of cards, so nothing jumps when the page arrives.
- Page tab rows load as the real segmented tab row with their labels instead of one bar.
- Framed tables, fact strips, caption lines and right-aligned toolbars in a page skeleton follow the loaded page, and the connections, logs, DNS, flows and configuration first-read skeletons match their content's boxes. The configuration page no longer switches tabs when its first read arrives.
- The Activity, status, nodes, policies, routing rules, DNS and settings skeletons now match their content on wide screens, tablets and phones: the dashboard draws the default layout's cards from startup, the status row wraps as the loaded one does, and a fact strip no longer takes an extra row while it loads.
- A page's skeleton, once it shows, stays visible while startup, the page's code and its first reads follow one another, instead of disappearing and waiting another 150ms at each step; a page opened later, or a part that waits again, counts its own 150ms.
- The startup screen draws the page the shell is about to open, the saved start page or Settings on a first run, and the page opens at the offset the startup skeleton was scrolled to only when it is the same page.
