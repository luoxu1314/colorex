from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

from schemas import CropMargins, ImageInput, RenderSettings

# Note: ``cv2`` and ``matplotlib`` are intentionally NOT imported at module
# level. They are the heaviest cold-start dependencies (opencv alone pulls in
# dozens of MB of DLLs on Windows) and only a subset of actions need them, so
# we defer their imports to the functions that actually use them.


def read_grayscale(path: str) -> np.ndarray:
    with Image.open(path) as img:
        img = ImageOps.exif_transpose(img)
        if img.mode in ("I;16", "I", "F"):
            arr = np.asarray(img)
            if arr.ndim == 3:
                arr = np.asarray(img.convert("L"))
            return arr.astype(np.float64)
        if img.mode in ("RGB", "RGBA", "P", "CMYK", "LA"):
            img = img.convert("RGB").convert("L")
        else:
            img = img.convert("L")
        return np.asarray(img).astype(np.float64)


def safe_percentile(values: np.ndarray, pct: float) -> float:
    flat = np.asarray(values, dtype=np.float64).ravel()
    if flat.size == 0:
        return 0.0
    return float(np.percentile(flat, pct, method="linear"))


def apply_crop(arr: np.ndarray, crop: CropMargins | None) -> np.ndarray:
    if crop is None or not crop.enabled:
        return arr
    h, w = arr.shape[:2]
    left = max(0, min(0.9, crop.left))
    right = max(0, min(0.9, crop.right))
    top = max(0, min(0.9, crop.top))
    bottom = max(0, min(0.9, crop.bottom))
    if left + right >= 0.96:
        right = max(0, 0.96 - left)
    if top + bottom >= 0.96:
        bottom = max(0, 0.96 - top)
    x1 = int(round(w * left))
    x2 = int(round(w * (1 - right)))
    y1 = int(round(h * top))
    y2 = int(round(h * (1 - bottom)))
    if x2 <= x1 + 1 or y2 <= y1 + 1:
        return arr
    return arr[y1:y2, x1:x2]


def preprocess_image(arr: np.ndarray, settings: RenderSettings) -> np.ndarray:
    im = arr.astype(np.float64, copy=True)
    if settings.black_level_enabled:
        b = safe_percentile(im, settings.black_level_percentile)
        im = im - b
        im[im < 0] = 0
    if settings.threshold_enabled:
        im[im <= settings.threshold] = 0
    return im


def resize_center_crop_square(arr: np.ndarray, size: int) -> np.ndarray:
    h, w = arr.shape[:2]
    if h == size and w == size:
        return arr
    scale = max(size / h, size / w)
    new_w = max(size, int(round(w * scale)))
    new_h = max(size, int(round(h * scale)))
    # Lazy import: only the mosaic pipeline hits this, preview/convert paths
    # never do. Keeping cv2 out of module top-level lets the daemon's ready
    # banner fire ~1s earlier.
    import cv2
    resized = cv2.resize(arr, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    y1 = max(0, (new_h - size) // 2)
    x1 = max(0, (new_w - size) // 2)
    return resized[y1 : y1 + size, x1 : x1 + size]


def normalize_image(arr: np.ndarray, settings: RenderSettings) -> np.ndarray:
    if settings.normalize_mode == "absolute":
        return arr
    if settings.normalize_mode == "percentile":
        lo = safe_percentile(arr, 1)
        hi = safe_percentile(arr, 99.5)
    else:
        lo = float(np.min(arr))
        hi = float(np.max(arr))
    if hi <= lo + np.finfo(float).eps:
        return np.zeros_like(arr, dtype=np.float64)
    out = (arr - lo) / (hi - lo)
    return np.clip(out, 0, 1)


def prepare_images(images: list[ImageInput], settings: RenderSettings) -> tuple[list[np.ndarray], int]:
    raws = [apply_crop(read_grayscale(image.path), image.crop) for image in images]
    if not raws:
        raise ValueError("未提供图像。")
    square_size = max(max(arr.shape[:2]) for arr in raws)
    processed: list[np.ndarray] = []
    for arr in raws:
        im = preprocess_image(arr, settings)
        im = resize_center_crop_square(im, square_size)
        im = normalize_image(im, settings)
        processed.append(im)
    return processed, square_size


def generate_preview(input_path: str, output_path: str, max_size: int = 2048) -> dict:
    """Decode an image (including TIFF) and save an 8-bit PNG preview.

    The output preserves aspect ratio and is bounded by ``max_size`` on the
    longer side. 16-bit / float TIFFs are min-max stretched to 8-bit so the
    preview is actually visible (raw 16-bit data is mostly near-black).
    """
    with Image.open(input_path) as img:
        img = ImageOps.exif_transpose(img)
        mode = img.mode
        if mode in ("I;16", "I;16B", "I;16L", "I;16N", "I", "F"):
            arr = np.asarray(img).astype(np.float64)
            if arr.size:
                lo = float(np.min(arr))
                hi = float(np.max(arr))
            else:
                lo, hi = 0.0, 1.0
            if hi <= lo + np.finfo(float).eps:
                arr8 = np.zeros_like(arr, dtype=np.uint8)
            else:
                arr8 = np.clip((arr - lo) / (hi - lo) * 255.0, 0, 255).astype(np.uint8)
            img = Image.fromarray(arr8, mode="L")
        elif mode not in ("RGB", "RGBA", "L", "LA"):
            img = img.convert("RGB")

        w, h = img.size
        longest = max(w, h)
        if longest > max_size and longest > 0:
            scale = max_size / longest
            new_size = (max(1, int(round(w * scale))), max(1, int(round(h * scale))))
            img = img.resize(new_size, Image.LANCZOS)

        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        img.save(out, format="PNG", optimize=False)
        return {
            "success": True,
            "previewPath": str(out),
            "width": int(img.size[0]),
            "height": int(img.size[1]),
            "message": "ok",
        }


def save_single_pseudocolor(input_path: str, output_path: str, settings: RenderSettings) -> dict:
    from matplotlib import colors

    from colormap_utils import get_colormap

    arr = read_grayscale(input_path)
    arr = preprocess_image(arr, settings)
    arr = normalize_image(arr, settings)
    if settings.clim_max <= settings.clim_min:
        raise ValueError("CLim 最大值必须大于最小值。")
    cmap = get_colormap(settings.colormap)
    norm = colors.Normalize(vmin=settings.clim_min, vmax=settings.clim_max, clip=True)
    rgba = cmap(norm(arr), bytes=True)
    rgb = rgba[:, :, :3]
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgb).save(out)
    return {"success": True, "outputPath": str(out), "width": int(rgb.shape[1]), "height": int(rgb.shape[0]), "message": "ok"}
