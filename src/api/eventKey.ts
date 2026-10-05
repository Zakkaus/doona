// An event's id is its stream cursor, and events of different kinds can share one: the `stream.ready` that opens a
// resumed stream repeats the cursor of the event before it. Feeds and lists key each event by kind and id, joined
// without whitespace because React Aria builds element ids from row keys.
export const eventKey = (event: {event: string; id: string}) => `${event.event}:${event.id}`;
