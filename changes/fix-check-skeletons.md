Fixed

- The global settings tab, the Logs chart, the policy cards and the node table's provider line draw their first-load Skeletons through the shared parts: the delay, one hidden status and the loaded height.
- A chunk that fails to load no longer flashes the update message on the page that is already reloading itself; the message comes up only if the reload is cancelled or not allowed.
