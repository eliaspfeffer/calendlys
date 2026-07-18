#!/usr/bin/env python3
"""Tiny local server for Calendlys: static files, local text storage, and GitHub sync."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "data" / "calendlys.txt"
MAX_BODY_BYTES = 2_000_000


def read_links() -> list[dict]:
    if not DATA_FILE.exists():
        return []
    payload = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    links = payload if isinstance(payload, list) else payload.get("links") if isinstance(payload, dict) else None
    if not isinstance(links, list):
        raise ValueError("data/calendlys.txt does not contain a links list")
    return links


def write_links(links: object) -> None:
    if not isinstance(links, list):
        raise ValueError("links must be a list")
    if len(links) > 5000:
        raise ValueError("too many links")

    clean: list[dict] = []
    for item in links:
        if not isinstance(item, dict) or not isinstance(item.get("url"), str) or not isinstance(item.get("name"), str):
            raise ValueError("each link needs a name and URL")
        clean.append({
            "id": str(item.get("id", ""))[:200],
            "name": item["name"][:80],
            "url": item["url"][:500],
            "createdAt": str(item.get("createdAt", ""))[:40],
            "updatedAt": str(item.get("updatedAt", ""))[:40],
        })

    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "app": "Calendlys",
        "version": 1,
        "links": clean,
    }
    encoded = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=DATA_FILE.parent, delete=False) as handle:
        handle.write(encoded)
        temporary = Path(handle.name)
    os.replace(temporary, DATA_FILE)


def run_git(*args: str, allow_no_changes: bool = False) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    if result.returncode and not allow_no_changes:
        message = (result.stderr or result.stdout or "Git command failed").strip()
        raise RuntimeError(message[-1000:])
    return result


def sync_to_github() -> str:
    relative = str(DATA_FILE.relative_to(ROOT))
    run_git("add", "--", relative)
    diff = run_git("diff", "--cached", "--quiet", "--", relative, allow_no_changes=True)
    if diff.returncode:
        run_git("commit", "-m", "chore: update saved calendar links", "--", relative)
        action = "Saved and pushed"
    else:
        action = "Already up to date"
    run_git("push", "origin", "HEAD")
    return action


class CalendlysHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if urlparse(self.path).path == "/api/links":
            try:
                self.send_json(HTTPStatus.OK, {"links": read_links()})
            except Exception as error:  # local tool: surface readable error to its owner
                self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(error)})
            return
        super().do_GET()

    def do_PUT(self) -> None:  # noqa: N802
        if urlparse(self.path).path != "/api/links":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        if not self.is_same_origin():
            self.send_json(HTTPStatus.FORBIDDEN, {"error": "Cross-origin write blocked"})
            return
        try:
            body = self.read_json()
            write_links(body.get("links"))
            self.send_json(HTTPStatus.OK, {"saved": True})
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
        except Exception as error:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(error)})

    def do_POST(self) -> None:  # noqa: N802
        if urlparse(self.path).path != "/api/github-sync":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        if not self.is_same_origin():
            self.send_json(HTTPStatus.FORBIDDEN, {"error": "Cross-origin write blocked"})
            return
        try:
            body = self.read_json()
            write_links(body.get("links"))
            message = sync_to_github()
            self.send_json(HTTPStatus.OK, {"message": message})
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
        except (RuntimeError, subprocess.TimeoutExpired) as error:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(error)})
        except Exception as error:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(error)})

    def is_same_origin(self) -> bool:
        origin = self.headers.get("Origin")
        if not origin:
            return True
        parsed = urlparse(origin)
        return parsed.scheme == "http" and parsed.netloc == self.headers.get("Host")

    def read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ValueError("invalid content length") from error
        if length <= 0 or length > MAX_BODY_BYTES:
            raise ValueError("invalid request size")
        payload = json.loads(self.rfile.read(length).decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("request must be an object")
        return payload

    def send_json(self, status: HTTPStatus, payload: dict) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


if __name__ == "__main__":
    address = ("127.0.0.1", 4173)
    print(f"Calendlys running at http://{address[0]}:{address[1]}", flush=True)
    print(f"Local link file: {DATA_FILE}", flush=True)
    ThreadingHTTPServer(address, CalendlysHandler).serve_forever()
