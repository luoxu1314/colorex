from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path

from image_pipeline import generate_preview, save_single_pseudocolor
from mosaic_renderer import render_mosaic
from schemas import parse_images, parse_settings


def ok(result: dict) -> dict:
    result["success"] = bool(result.get("success", True))
    return result


def fail(error: str) -> dict:
    return {"success": False, "error": error}


def dispatch(action: str | None, payload: dict) -> dict:
    settings = parse_settings(payload.get("settings") or {})
    if action == "render_mosaic":
        images = parse_images(payload.get("images") or [])
        return ok(render_mosaic(images, settings, output_path=payload.get("outputPath")))
    if action == "convert_single":
        return ok(
            save_single_pseudocolor(str(payload["inputPath"]), str(payload["outputPath"]), settings)
        )
    if action == "generate_preview":
        return ok(
            generate_preview(
                str(payload["inputPath"]),
                str(payload["outputPath"]),
                int(payload.get("maxSize", 2048)),
            )
        )
    if action == "ping":
        return ok({"success": True, "message": "pong"})
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
    # Announce readiness so the host can start sending work immediately.
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
