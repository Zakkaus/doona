Fixed

- Switching between the Connections and Events pages no longer makes the browser tab run out of memory. Each switch reopens the event stream, and the event that opens it shares its id with the event before; the Events table and the notices now tell such events apart.
