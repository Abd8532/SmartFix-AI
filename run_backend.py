"""
SmartFix AI - Local Python Backend Entrypoint
Run this script to start the authoritative Python backend for local development.
"""
import os
import sys

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.app.server import run_server

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "127.0.0.1")
    run_server(host, port)
