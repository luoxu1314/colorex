from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal


NormalizeMode = Literal["absolute", "perImage", "percentile"]
BackgroundMode = Literal["colormap", "black", "transparent"]


@dataclass
class CropMargins:
    enabled: bool = False
    left: float = 0.0
    top: float = 0.0
    right: float = 0.0
    bottom: float = 0.0


@dataclass
class ImageInput:
    path: str
    label: str
    crop: CropMargins


@dataclass
class RenderSettings:
    normalize_mode: NormalizeMode = "absolute"
    black_level_enabled: bool = True
    black_level_percentile: float = 1.0
    threshold_enabled: bool = True
    threshold: float = 10.0
    clim_min: float = 0.0
    clim_max: float = 250.0
    colormap: str = "jet"
    columns: int = 2
    background_mode: BackgroundMode = "colormap"
    colorbar_reserve_ratio: float = 0.16
    show_colorbar: bool = True
    colorbar_label: str = "Pixel intensity"
    colorbar_font_size: int = 16
    colorbar_auto_font: bool = True
    colorbar_width: float = 0.025
    label_font_size: int = 36
    label_auto_font: bool = True
    label_color: str = "#ffffff"
    label_font_family: str = "Times New Roman"
    label_bold: bool = False
    show_row_separators: bool = True
    show_column_separators: bool = False
    separator_color: str = "#595959"
    separator_line_width: float = 0.6
    dpi: int = 300
    output_format: str = "png"
    output_path: str = "colorexchange_output.png"
    transparent_background: bool = False
    preview_max_pixels: int = 1800


def _camel(data: dict[str, Any], key: str, default: Any) -> Any:
    return data.get(key, default)


def parse_images(raw: list[dict[str, Any]]) -> list[ImageInput]:
    images: list[ImageInput] = []
    for item in raw:
        crop_raw = item.get("crop") or {}
        crop = CropMargins(
            enabled=bool(crop_raw.get("enabled", False)),
            left=float(crop_raw.get("left", 0) or 0),
            top=float(crop_raw.get("top", 0) or 0),
            right=float(crop_raw.get("right", 0) or 0),
            bottom=float(crop_raw.get("bottom", 0) or 0),
        )
        images.append(ImageInput(path=str(item["path"]), label=str(item.get("label", "")), crop=crop))
    return images


def parse_settings(raw: dict[str, Any]) -> RenderSettings:
    return RenderSettings(
        normalize_mode=_camel(raw, "normalizeMode", "absolute"),
        black_level_enabled=bool(_camel(raw, "blackLevelEnabled", True)),
        black_level_percentile=float(_camel(raw, "blackLevelPercentile", 1)),
        threshold_enabled=bool(_camel(raw, "thresholdEnabled", True)),
        threshold=float(_camel(raw, "threshold", 10)),
        clim_min=float(_camel(raw, "climMin", 0)),
        clim_max=float(_camel(raw, "climMax", 250)),
        colormap=str(_camel(raw, "colormap", "jet")),
        columns=max(1, int(_camel(raw, "columns", 2))),
        background_mode=_camel(raw, "backgroundMode", "colormap"),
        colorbar_reserve_ratio=float(_camel(raw, "colorbarReserveRatio", 0.16)),
        show_colorbar=bool(_camel(raw, "showColorbar", True)),
        colorbar_label=str(_camel(raw, "colorbarLabel", "")),
        colorbar_font_size=int(_camel(raw, "colorbarFontSize", 16)),
        colorbar_auto_font=bool(_camel(raw, "colorbarAutoFont", True)),
        colorbar_width=float(_camel(raw, "colorbarWidth", 0.025)),
        label_font_size=int(_camel(raw, "labelFontSize", 36)),
        label_auto_font=bool(_camel(raw, "labelAutoFont", True)),
        label_color=str(_camel(raw, "labelColor", "#ffffff")),
        label_font_family=str(_camel(raw, "labelFontFamily", "Times New Roman")),
        label_bold=bool(_camel(raw, "labelBold", False)),
        show_row_separators=bool(_camel(raw, "showRowSeparators", True)),
        show_column_separators=bool(_camel(raw, "showColumnSeparators", False)),
        separator_color=str(_camel(raw, "separatorColor", "#595959")),
        separator_line_width=float(_camel(raw, "separatorLineWidth", 0.6)),
        dpi=max(72, min(1200, int(_camel(raw, "dpi", 300)))),
        output_format=str(_camel(raw, "outputFormat", "png")).lower(),
        output_path=str(_camel(raw, "outputPath", "colorexchange_output.png")),
        transparent_background=bool(_camel(raw, "transparentBackground", False)),
        preview_max_pixels=max(600, int(_camel(raw, "previewMaxPixels", 1800))),
    )
