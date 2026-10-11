Added

- The node dialog shows a vless or trojan XHTTP link's options as fields: mode, path, host, headers, padding and POST pacing from its extra JSON, and a separate download peer. Editing fields changes their corresponding query parameters or JSON members; extra JSON is reserialized with JavaScript number precision.
- Header names are trimmed, and case-insensitive duplicates show a field error and block saving until corrected, keeping both editable values. Unnamed rows remain protected unsaved drafts without rewriting an empty headers object; replacing the raw link replaces those rows.
- Saving an edited node link first asks honk to read it within the same shared save transaction, so other group and routing-mode edits wait throughout validation and saving, even if the dialog closes. A link honk would skip is refused with a translated diagnostic and any backend detail, even when the backend message is empty.
- Adding a node refuses a link longer than the 8192 characters the API accepts; editing an existing declaration does not apply that creation limit, and clearing required edit fields explains why saving is disabled.
- Changed XHTTP parameters encode single quotes so header values and paths remain writable in configuration text; partial download changes preserve untouched settings.
- Renamed node declarations always quote their names, including `mux`, which honk otherwise reads as a removed standalone setting.
- XHTTP help is more concise in all three languages, retaining the existing startup download budgets.
