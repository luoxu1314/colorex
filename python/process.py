from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path

from image_pipeline import save_single_pseudocolor
from mosaic_renderer import render_mosaic
from schemas import parse_images, parse_settings


def ok(result: dict) -> dict:
    result["success"] = bool(result.get("success", True))
    return result


def fail(error: str) -> dict:
    return {"success": False, "error": error}


def handle(request: dict) -> dict:
    action = request.get("action")
    payload = request.get("payload") or {}
    settings = parse_settings(payload.get("settings") or {})
    if action == "render_mosaic":
        images = parse_images(payload.get("images") or [])
        return ok(render_mosaic(images, settings, output_path=payload.get("outputPath")))
    if action == "convert_single":
        return ok(save_single_pseudocolor(str(payload["inputPath"]), str(payload["outputPath"]), settings))
    return fail(f"未知操作：{action}")


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps(fail("缺少 request json 路径。"), ensure_ascii=False))
        return 2
    request_path = Path(sys.argv[1])
    response_path = None
    try:
        request = json.loads(request_path.read_text(encoding="utf-8"))
        response_path = Path(request["responsePath"])
        result = handle(request)
    except Exception as exc:
        result = fail(f"{exc}\n{traceback.format_exc(limit=6)}")
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if response_path:
        response_path.write_text(text, encoding="utf-8")
    else:
        print(text)
    return 0 if result.get("success") else 1


if __name__ == "__main__":
    raise SystemExit(main())
