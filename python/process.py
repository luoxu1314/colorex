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

    Heavy dependencies (numpy / PIL / cv2 / matplotlib) are deferred to the
    functions that actually need them so that ``run_daemon`` can emit its
    ``ready`` banner before paying the ~1–60s cold-import cost. The first
    request pays for whatever modules its action happens to need; subsequent
    requests hit the module cache.
    """
    # schemas.py is cheap (just dataclasses) so importing it is fine.
    from schemas import parse_images, parse_settings

    if action == "ping":
        return ok({"success": True, "message": "pong"})

    settings = parse_settings(payload.get("settings") or {})

    if action == "generate_preview":
        # Only pulls in numpy + PIL. Does NOT trigger cv2/matplotlib.
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


def run_daemon() -> int:
    """Daemon protocol: one JSON request per line on stdin, one response per line
    on stdout. Empty line / EOF / parse errors are tolerated; the loop only
    exits on EOF. All exceptions are caught and returned as JSON so that a
    single bad request never kills the worker.
    """
    stdin = sys.stdin
    stdout = sys.stdout
    # Announce readiness BEFORE importing any heavy dependency. The Electron
    # side only needs to know stdin/stdout are alive; the real import cost is
    # paid lazily inside ``dispatch`` on the first request.
    stdout.write(json.dumps({"ready": True}) + "\n")
    stdout.flush()
    while True:
        line = stdin.readline()
        if not line:
            break
        line = line.strip()
        if not line:
            continue
        request_id = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            result = handle(request)
        except Exception as exc:  # noqa: BLE001
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
