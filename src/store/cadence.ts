// How often resources poll, in milliseconds. Events bring a fetch forward in between; a resource with `every: 0`
// follows events alone.
export const poll = {
  // Runtime state and the connection list: the default.
  live: 5000,
  // Lists read as a whole on each poll: flows and the DNS cache.
  lists: 15000,
  // The home page's connection ranking, a summary that need not follow every connection.
  summary: 20000,
  // Nodes, providers and groups, which change with the configuration.
  inventory: 30000,
  // Traffic and memory history, which the live samples extend in between, and the DNS cache usage.
  background: 60000
} as const;
// The largest page the contract lets a list request ask for.
export const MAX_PAGE = 1000;
