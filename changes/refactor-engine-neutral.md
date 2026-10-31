Internal

- The configuration export, import and revision routes, the restart command and the restart-only global settings come from the engine adapter, so the app and Lite no longer name honk outside `src/api/engines`. An engine doona does not know offers no configuration history, shows no restart command, and Lite offers it no global settings forms.
- The suggested backend port is named as the native API's default port, and the retired API names that block sign-in are kept in one list.
