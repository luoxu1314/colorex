from __future__ import annotations

import math
import tempfile
import uuid
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
from matplotlib import cm, colors
from matplotlib.gridspec import GridSpec
import numpy as np
from PIL import Image

from colormap_utils import background_color, get_colormap
from image_pipeline import prepare_images, resize_grayscale_array
from schemas import ImageInput, RenderSettings

CJK_FONT_FALLBACKS = [
    "Microsoft YaHei",
    "SimHei",
    "SimSun",
    "PingFang SC",
    "Heiti SC",
    "Noto Sans CJK SC",
    "Source Han Sans SC",
    "WenQuanYi Zen Hei",
    "Arial Unicode MS",
]


def _contains_cjk(text: str) -> bool:
    return any(
        "\u3400" <= ch <= "\u4dbf"
        or "\u4e00" <= ch <= "\u9fff"
        or "\uf900" <= ch <= "\ufaff"
        for ch in text
    )


def _font_family_for_text(preferred: str, text: str) -> list[str] | str:
    if not _contains_cjk(text):
        return preferred
    fallback = [font for font in CJK_FONT_FALLBACKS if font != preferred]
    if preferred in CJK_FONT_FALLBACKS:
        return [preferred, *fallback]
    return [*fallback, preferred]


def _ticks(settings: RenderSettings) -> np.ndarray:
    if settings.normalize_mode != "absolute":
        return np.linspace(0, 1, 6)
    if settings.clim_max <= settings.clim_min:
        return np.array([settings.clim_min])
    return np.linspace(settings.clim_min, settings.clim_max, 6)


def _px_to_points(px: float, dpi: int) -> float:
    return px * 72.0 / max(72, dpi)


def _label_font_size(settings: RenderSettings, tile_px: int, labels: list[str], dpi: int) -> float:
    if not settings.label_auto_font:
        return float(settings.label_font_size)
    max_len = max([len(label) for label in labels] or [1])
    from_width_px = (tile_px * 0.94) / max(1, max_len * 0.55)
    from_height_px = tile_px * 0.11
    target_px = max(28, min(from_width_px, from_height_px, 96))
    return max(10, min(_px_to_points(target_px, dpi), 36))


def _colorbar_font_size(settings: RenderSettings, height_px: int, dpi: int) -> float:
    if not settings.colorbar_auto_font:
        return float(settings.colorbar_font_size)
    target_px = max(24, min(height_px * 0.050, 72))
    return max(8, min(_px_to_points(target_px, dpi), 28))


def _ensure_output_path(path: str | None, fmt: str) -> str:
    if path:
        out = Path(path)
    else:
        out = Path(tempfile.gettempdir()) / f"colorexchange_preview.{fmt}"
    if not out.suffix:
        out = out.with_suffix(f".{fmt}")
    out.parent.mkdir(parents=True, exist_ok=True)
    return str(out)


def _resize_for_preview(arrays: list[np.ndarray], tile_size: int, n_cols: int, n_rows: int, settings: RenderSettings) -> tuple[list[np.ndarray], int]:
    reserve = max(0.05, min(0.4, settings.colorbar_reserve_ratio)) if settings.show_colorbar else 0
    width_factor = n_cols / (1 - reserve) if reserve > 0 else n_cols
    height_factor = n_rows
    max_tile_by_width = settings.preview_max_pixels / max(1, width_factor)
    max_tile_by_height = settings.preview_max_pixels / max(1, height_factor)
    preview_tile = int(max(96, min(tile_size, max_tile_by_width, max_tile_by_height)))
    if preview_tile >= tile_size:
        return arrays, tile_size
    resized = [
        resize_grayscale_array(
            arr,
            (preview_tile, preview_tile),
            resample=Image.Resampling.BOX,
        )
        for arr in arrays
    ]
    return resized, preview_tile


def render_mosaic(
    images: list[ImageInput],
    settings: RenderSettings,
    output_path: str | None = None,
    preview_path: str | None = None,
) -> dict:
    if not images:
        raise ValueError("请先添加图像文件。")
    if settings.clim_max <= settings.clim_min:
        raise ValueError("CLim 最大值必须大于最小值。")

    arrays, tile_size = prepare_images(images, settings)
    n = len(arrays)
    n_cols = max(1, min(settings.columns, n))
    n_rows = int(math.ceil(n / n_cols))
    is_export = bool(output_path)
    if not is_export:
        arrays, tile_size = _resize_for_preview(arrays, tile_size, n_cols, n_rows, settings)

    cmap = get_colormap(settings.colormap)
    norm = colors.Normalize(vmin=settings.clim_min, vmax=settings.clim_max, clip=True)
    face = background_color(cmap, settings.background_mode, settings.transparent_background)
    has_cbar = settings.show_colorbar

    grid_w_px = n_cols * tile_size
    grid_h_px = n_rows * tile_size
    height_px = grid_h_px
    dpi = settings.dpi

    # ``cbar_font_size`` depends only on grid height + dpi, so we can resolve
    # it before the reserve calculation. That lets us auto-expand the right-
    # hand reserve to guarantee enough room for tick labels AND a vertically
    # rotated colorbar label — otherwise longer labels (e.g. "Normalized
    # intensity") overflow past the figure edge.
    cbar_font_size = _colorbar_font_size(settings, height_px, dpi) if has_cbar else 0

    user_reserve = max(0.05, min(0.4, settings.colorbar_reserve_ratio)) if has_cbar else 0
    if has_cbar:
        # Tight estimate of the min width (px) needed to the right of the
        # mosaic so ticks + rotated label + a small safety margin fit without
        # clipping the figure edge. Coefficients calibrated against actual
        # matplotlib renders (see smoke test in the chat history).
        font_px = cbar_font_size * dpi / 72.0
        cbar_px_est = max(20.0, settings.colorbar_width * grid_w_px)
        tick_label_px = 2.1 * font_px         # "0.25" / "1.0" width + tiny pad
        rot_label_px = 1.1 * font_px if settings.colorbar_label else 0.0
        gap_px = 22.0 if settings.colorbar_label else 14.0
        required_right_px = cbar_px_est + tick_label_px + rot_label_px + gap_px
        required_reserve = required_right_px / (grid_w_px + required_right_px)
        # Respect the user's setting as a floor only when they've explicitly
        # asked for MORE space than we need; otherwise use the tight auto
        # value so no-label renders don't over-reserve blank margin.
        reserve = min(0.42, max(user_reserve, required_reserve))
    else:
        reserve = 0

    right_px = round(grid_w_px * (reserve / (1 - reserve))) if has_cbar else 0
    width_px = grid_w_px + right_px

    fig = plt.figure(figsize=(width_px / dpi, height_px / dpi), dpi=dpi, facecolor=face)
    if settings.transparent_background or settings.background_mode == "transparent":
        fig.patch.set_alpha(0)

    if has_cbar:
        gs = GridSpec(n_rows, n_cols + 1, figure=fig, width_ratios=[1] * n_cols + [right_px / tile_size], wspace=0, hspace=0)
    else:
        gs = GridSpec(n_rows, n_cols, figure=fig, wspace=0, hspace=0)

    labels = [item.label for item in images]
    label_size = _label_font_size(settings, tile_size, labels, dpi)
    # cbar_font_size was already resolved above so that the right-hand reserve
    # could accommodate the rotated colorbar label. Reuse it here.

    for idx, arr in enumerate(arrays):
        row = idx // n_cols
        col = idx % n_cols
        label = labels[idx]
        ax = fig.add_subplot(gs[row, col])
        ax.imshow(arr, cmap=cmap, norm=norm, interpolation="nearest")
        ax.set_axis_off()
        ax.set_aspect("equal")
        ax.set_facecolor(face)
        ax.text(
            0.02,
            0.96,
            label,
            transform=ax.transAxes,
            color=settings.label_color,
            fontsize=label_size,
            fontweight="bold" if settings.label_bold else "normal",
            fontfamily=_font_family_for_text(settings.label_font_family, label),
            ha="left",
            va="top",
            clip_on=True,
        )

    for idx in range(n, n_rows * n_cols):
        row = idx // n_cols
        col = idx % n_cols
        ax = fig.add_subplot(gs[row, col])
        ax.set_axis_off()
        ax.set_facecolor(face)

    fig.subplots_adjust(left=0, right=1, bottom=0, top=1, wspace=0, hspace=0)

    if settings.show_row_separators and n_rows >= 2:
        for row in range(1, n_rows):
            y = 1 - row / n_rows
            fig.lines.append(plt.Line2D([0, grid_w_px / width_px], [y, y], transform=fig.transFigure, color=settings.separator_color, linewidth=settings.separator_line_width))

    if settings.show_column_separators and n_cols >= 2:
        for col in range(1, n_cols):
            x = (col * tile_size) / width_px
            fig.lines.append(plt.Line2D([x, x], [0, 1], transform=fig.transFigure, color=settings.separator_color, linewidth=settings.separator_line_width))

    if has_cbar:
        right_area = max(0.001, right_px / width_px)

        # Font height expressed as a fraction of the figure width, used to
        # reserve space to the right of the colorbar for tick numbers and the
        # vertically rotated colorbar label. (1 pt = dpi/72 px.)
        font_frac = cbar_font_size * dpi / 72.0 / max(1, width_px)

        has_rot_label = bool(settings.colorbar_label)
        # Budgets (figure-width fractions) calibrated against real matplotlib
        # renders. Previously we over-reserved ~50+ px of blank right margin;
        # these tighter coefficients leave ~10–15 px of safety.
        tick_label_budget = 2.0 * font_frac           # "0.25" / "1.0" width
        label_pad_budget = (4.0 / 72.0) * dpi / max(1, width_px)  # labelpad in fig fraction
        rot_label_budget = (1.0 * font_frac + label_pad_budget) if has_rot_label else 0.0
        edge_safety = 0.004

        right_side_budget = tick_label_budget + rot_label_budget + edge_safety

        # Colorbar width: obey the user setting but cap at a sensible slice
        # of the reserved area so there's always room for labels.
        cbar_width = max(0.010, min(settings.colorbar_width, right_area * 0.22))

        # Work backwards from the safe right edge so nothing clips the figure.
        max_left = 1.0 - right_side_budget - cbar_width
        # Preferred position: tuck the cbar close to the mosaic edge so the
        # reserved column is dominated by ticks + label rather than empty gap.
        preferred_left = grid_w_px / width_px + right_area * 0.12
        cbar_left = min(preferred_left, max_left)
        # Never overlap the mosaic tiles.
        cbar_left = max(cbar_left, grid_w_px / width_px + right_area * 0.05)

        cax = fig.add_axes([cbar_left, 0.04, cbar_width, 0.92])
        sm = cm.ScalarMappable(cmap=cmap, norm=norm)
        sm.set_array([])
        cbar = fig.colorbar(sm, cax=cax, orientation="vertical", ticks=_ticks(settings))
        cbar.ax.yaxis.set_ticks_position("right")
        cbar.ax.yaxis.set_label_position("right")
        cbar.ax.tick_params(
            colors="white", labelsize=cbar_font_size, direction="in", width=1.2, length=4
        )
        cbar.outline.set_edgecolor("white")
        cbar.outline.set_linewidth(1.2)

        # Vertical rotated label on the right, MATLAB/scientific convention.
        # The reserve ratio at the top of this function was already inflated
        # so that tick_label_budget + rot_label_budget fit without clipping,
        # regardless of how long the user's label string is.
        if has_rot_label:
            cbar.set_label(
                settings.colorbar_label,
                color="white",
                fontsize=cbar_font_size,
                fontfamily=_font_family_for_text(settings.label_font_family, settings.colorbar_label),
                labelpad=4,
            )

    save_path = _ensure_output_path(output_path, settings.output_format) if output_path else None
    preview = preview_path or str(Path(tempfile.gettempdir()) / f"colorexchange_preview_{uuid.uuid4().hex}.png")
    Path(preview).parent.mkdir(parents=True, exist_ok=True)

    save_kwargs = {"dpi": dpi, "facecolor": fig.get_facecolor(), "edgecolor": "none", "bbox_inches": None, "pad_inches": 0}
    if settings.transparent_background or settings.background_mode == "transparent":
        save_kwargs["transparent"] = True
    if save_path:
        fig.savefig(save_path, **save_kwargs)

    preview_dpi = dpi if not is_export else min(dpi, max(72, round(settings.preview_max_pixels / max(width_px / dpi, height_px / dpi))))
    fig.savefig(preview, dpi=preview_dpi, facecolor=fig.get_facecolor(), edgecolor="none", bbox_inches=None, pad_inches=0)
    plt.close(fig)

    return {
        "success": True,
        "outputPath": save_path,
        "previewPath": preview,
        "width": int(width_px),
        "height": int(height_px),
        "message": "ok",
    }
