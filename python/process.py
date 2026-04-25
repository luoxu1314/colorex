from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path


def ok(result: dict) -> dict:
    result["success"] = bool(result.get("success", True))
    return result


def fail(error: str) -> dict:
    return {"success": False, "error": error}


def dispatch(action: str | None, payload: dict) -> dict:
    """Route an incoming action.

    Heavy dependencies (numpy / PIL / matplotlib) are deferred to the
    functions that actually need them so that ``run_daemon`` can emit its
    ``ready`` banner before paying the ~1–60s cold-import cost. The first
    request pays for whatever modules its action happens to need; subsequent
    requests hit the module cache.
    """
    # schemas.py is cheap (just dataclasses) so importing it is fine.
    from schemas import parse_images, parse_settings

    if action == "ping":
        return ok({"success": True, "message": "pong"})

    if action == "warmup":
        # Eagerly pull in the expensive modules so the *first real* preview /
        # mosaic request doesn't eat the cold-import cost while the user is
        # staring at a spinner. Each stage is optional and independently
        # tolerable: skip cleanly on failure so warmup never blocks startup.
        stages = (payload or {}).get("stages") or ["preview"]
        loaded: list[str] = []
        errors: dict[str, str] = {}

        def _stage(name: str, fn):
            try:
                fn()
                loaded.append(name)
            except Exception as exc:  # noqa: BLE001
                errors[name] = str(exc)

        if "preview" in stages:
            _stage("numpy", lambda: __import__("numpy"))
            _stage("pillow", lambda: __import__("PIL.Image"))
        if "mosaic" in stages:
            _stage("matplotlib", lambda: __import__("matplotlib.pyplot"))

        return ok({"success": True, "loaded": loaded, "errors": errors, "message": "warmed"})

    settings = parse_settings(payload.get("settings") or {})

    if action == "generate_preview":
        # Only pulls in numpy + PIL. Does NOT trigger matplotlib.
        from image_pipeline import generate_preview
        return ok(
            generate_preview(
                str(payload["inputPath"]),
                str(payload["outputPath"]),
                int(payload.get("maxSize", 2048)),
            )
        )

    if action == "convert_single":
        # Needs numpy + PIL + matplotlib (colormap + Normalize).
        from image_pipeline import save_single_pseudocolor
        return ok(
            save_single_pseudocolor(
                str(payload["inputPath"]), str(payload["outputPath"]), settings
            )
        )

    if action == "render_mosaic":
        # Full dependency surface.
        from mosaic_renderer import render_mosaic
        images = parse_images(payload.get("images") or [])
        return ok(render_mosaic(images, settings, output_path=payload.get("outputPath")))

    return fail(f"未知操作：{action}")


def handle(request: dict) -> dict:
    try:
        return dispatch(request.get("action"), request.get("payload") or {})
    except Exception as exc:  # noqa: BLE001
        return fail(f"{exc}\n{traceback.format_exc(limit=6)}")


def run_one_shot(request_path: Path) -> int:
    """Original file-based protocol, kept for backwards compatibility."""
    response_path: Path | None = None
    try:
        request = json.loads(request_path.read_text(encoding="utf-8"))
        response_path = Path(request["responsePath"])
        result = handle(request)
    except Exception as exc:  # noqa: BLE001
        result = fail(f"{exc}\n{traceback.format_exc(limit=6)}")
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if response_path:
        response_path.write_text(text, encoding="utf-8")
    else:
        print(text)
    return 0 if result.get("success") else 1


def _diag(msg: str) -> None:
    """Write a diagnostic line to stderr. The Electron side forwards every
    stderr line into ``main.log`` as ``[python.stderr]`` so these heartbeats
    make it dead-easy to see whether Python received a request at all.
    """
    try:
        sys.stderr.write(f"[daemon] {msg}\n")
        sys.stderr.flush()
    except Exception:  # noqa: BLE001
        # stderr might be None under weird PyInstaller configurations; the
        # rest of the daemon still works without diagnostics.
        pass


# Persistent stdin buffer: preserves bytes across calls so that
# ``os.read`` chunks containing multiple newline-terminated JSON requests are
# handled correctly instead of silently dropping the trailing request.
_stdin_buffer: bytearray = bytearray()
# When True, the current logical line has already exceeded ``max_bytes`` and we
# are draining the remainder of it until the next newline. Prevents protocol
# desynchronization on oversized or malformed input.
_stdin_oversize: bool = False


def _read_line_raw(max_bytes: int = 16 * 1024 * 1024) -> bytes | None:
    """Read a single \\n-terminated line from fd 0 using ``os.read`` directly.

    Bypasses Python's text-mode stdin buffering, which has been observed to
    hang on Windows when the parent is Node/Electron with ``windowsHide: true``
    and a PyInstaller console bundle (the TextIOWrapper sometimes waits for
    a large block fill instead of returning as soon as a newline arrives on
    the underlying pipe).

    Returns:
        * ``bytes`` containing the line payload without the trailing newline.
        * ``None`` on EOF or unrecoverable ``os.read`` failure.
        * ``b""`` once, to signal that a line exceeded ``max_bytes`` and the
          rest of that line has been drained; the caller should surface a
          protocol error to the client but may safely continue reading.
    """
    import os

    global _stdin_oversize

    while True:
        nl = _stdin_buffer.find(b"\n")
        if nl >= 0:
            line = bytes(_stdin_buffer[:nl])
            del _stdin_buffer[: nl + 1]
            if _stdin_oversize:
                # Tail of a previously-oversized line -> throw it away and
                # keep looking for the next real line.
                _stdin_oversize = False
                _diag("drained oversized line remainder")
                continue
            return line

        # Either the buffer is building a normal line or we are mid-drain.
        if len(_stdin_buffer) >= max_bytes and not _stdin_oversize:
            _diag(f"line exceeded max {max_bytes} bytes, starting drain to next \\n")
            _stdin_oversize = True
            _stdin_buffer.clear()
            return b""

        try:
            chunk = os.read(0, 65536)
        except OSError as exc:
            _diag(f"os.read raised: {exc!r}")
            return None
        if not chunk:
            return None

        if _stdin_oversize:
            idx = chunk.find(b"\n")
            if idx < 0:
                # Still inside the oversized line; keep dropping.
                continue
            # Found end of the bad line; keep whatever followed.
            _stdin_buffer.extend(chunk[idx + 1 :])
            _stdin_oversize = False
            _diag("drained oversized line remainder")
            continue

        _stdin_buffer.extend(chunk)


def run_daemon() -> int:
    """Daemon protocol: one JSON request per line on stdin, one response per line
    on stdout. Empty line / EOF / parse errors are tolerated; the loop only
    exits on EOF. All exceptions are caught and returned as JSON so that a
    single bad request never kills the worker.
    """
    import os

    # Self-report the environment so we can verify from main.log that the
    # bundled PyInstaller exe is actually running (not a stray system Python).
    _diag(
        f"boot pid={os.getpid()} exe={sys.executable} "
        f"stdin_tty={getattr(sys.stdin, 'isatty', lambda: None)()} "
        f"stdout_tty={getattr(sys.stdout, 'isatty', lambda: None)()}"
    )

    stdout = sys.stdout
    # Announce readiness BEFORE importing any heavy dependency. The Electron
    # side only needs to know stdin/stdout are alive; the real import cost is
    # paid lazily inside ``dispatch`` on the first request.
    stdout.write(json.dumps({"ready": True}) + "\n")
    stdout.flush()
    _diag("ready sent, entering read loop (raw os.read on fd 0)")

    while True:
        raw = _read_line_raw()
        if raw is None:
            _diag("stdin EOF, exiting loop")
            break
        if not raw:
            # b"" means an oversized line was drained and the protocol is
            # realigned again. There is no id to correlate (we threw the bytes
            # away) so we can only surface a generic error; Electron's per-
            # request timeout will already have fired for the caller.
            try:
                stdout.write(
                    json.dumps(
                        {
                            "success": False,
                            "error": "请求超出单行 16MB 上限，已丢弃并继续监听。",
                        }
                    )
                    + "\n"
                )
                stdout.flush()
            except Exception:  # noqa: BLE001
                pass
            continue
        try:
            line = raw.decode("utf-8", errors="replace").strip()
        except Exception as exc:  # noqa: BLE001
            _diag(f"decode failed: {exc!r}")
            continue
        if not line:
            continue
        _diag(f"received {len(line)} chars")
        request_id = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            action = request.get("action")
            _diag(f"dispatch id={request_id} action={action}")
            result = handle(request)
            _diag(f"dispatch done id={request_id} success={result.get('success')}")
        except Exception as exc:  # noqa: BLE001
            _diag(f"dispatch crashed id={request_id}: {exc!r}")
            result = fail(f"{exc}\n{traceback.format_exc(limit=6)}")
        if request_id is not None:
            result["id"] = request_id
        stdout.write(json.dumps(result, ensure_ascii=False) + "\n")
        stdout.flush()
    return 0


def main() -> int:
    if len(sys.argv) >= 2 and sys.argv[1] == "--daemon":
        return run_daemon()
    if len(sys.argv) < 2:
        print(json.dumps(fail("缺少 request json 路径。"), ensure_ascii=False))
        return 2
    return run_one_shot(Path(sys.argv[1]))


if __name__ == "__main__":
    raise SystemExit(main())
