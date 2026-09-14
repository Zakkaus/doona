#!/usr/bin/env python3
"""Static server for the local build with caching disabled, so a plain refresh always shows the latest bundle."""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
    def log_message(self, *args):
        pass

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    directory = sys.argv[2] if len(sys.argv) > 2 else '.'
    import functools
    handler = functools.partial(NoCache, directory=directory)
    ThreadingHTTPServer(('0.0.0.0', port), handler).serve_forever()
