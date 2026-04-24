from __future__ import annotations

import numpy as np

# matplotlib is intentionally imported lazily inside the helpers below; see
# ``image_pipeline.py`` for the rationale.


def _parula():
    """Compact approximation of MATLAB parula. Built on demand."""
    from matplotlib.colors import LinearSegmentedColormap

    anchors = np.array(
        [
            [0.2081, 0.1663, 0.5292],
            [0.1184, 0.2970, 0.7537],
            [0.0483, 0.4718, 0.7973],
            [0.0691, 0.6227, 0.7115],
            [0.2300, 0.7360, 0.5400],
            [0.4796, 0.7765, 0.3522],
            [0.7414, 0.7425, 0.1908],
            [0.9553, 0.9011, 0.1181],
        ]
    )
    return LinearSegmentedColormap.from_list("parula", anchors, N=256)


def get_colormap(name: str):
    from matplotlib import colormaps

    key = (name or "jet").lower()
    if key == "parula":
        return _parula()
    try:
        return colormaps.get_cmap(key)
    except (ValueError, KeyError, Exception):  # noqa: BLE001 - matplotlib versions vary
        return colormaps.get_cmap("jet")


def background_color(cmap, mode: str, transparent: bool = False):
    if transparent or mode == "transparent":
        return (0, 0, 0, 0)
    if mode == "colormap":
        return cmap(0.0)
    return (0, 0, 0, 1)
