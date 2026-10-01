#!/usr/bin/env python3
"""Serve Bit Width Lab on localhost.

    python3 serve.py            # http://127.0.0.1:7171
    python3 serve.py 8080       # another port
    python3 serve.py --open     # and open a browser tab

Binds to 127.0.0.1 only, so nothing else on the network can reach it.
Standard library only; no install step.
"""

import http.server
import os
import socketserver
import sys
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PORT = int(os.environ.get("BITWIDTH_PORT", "7171"))


class Handler(http.server.SimpleHTTPRequestHandler):
    # Windows can map .js to text/plain through the registry, and browsers
    # refuse to run an ES module served that way. Pin the types we use.
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".html": "text/html",
        ".css": "text/css",
        ".json": "application/json",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    port = int(args[0]) if args else DEFAULT_PORT
    socketserver.TCPServer.allow_reuse_address = True
    try:
        httpd = socketserver.ThreadingTCPServer(("127.0.0.1", port), Handler)
    except OSError as e:
        print(f"Port {port} is busy ({type(e).__name__}). Try: python3 serve.py {port + 1}")
        sys.exit(1)
    url = f"http://127.0.0.1:{port}/"
    print(f"Bit Width Lab: {url}  (Ctrl-C to stop)")
    if "--open" in sys.argv:
        webbrowser.open(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print()
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
