// Closes the HTTP servers a test started and empties the list; a failed close rejects.
export function closeServers(servers) {
  return Promise.all(
    servers.splice(0).map(
      server =>
        new Promise((resolve, reject) => {
          server.close(error => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        })
    )
  );
}
