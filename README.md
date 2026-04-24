# ColorExchange Electron

Vue 3 + Electron + Python 重构版多光谱图像伪彩色拼接工具。界面负责文件管理、排序、标签和参数收集；核心图像处理、伪彩色映射、拼图和科学色条全部由 Python/NumPy/Matplotlib 完成。

## 功能映射表

| 原 MATLAB/HTML 功能 | 现有实现位置 | 新架构实现模块 | 是否必须保留 | 重构注意事项 |
|---|---|---|---|---|
| 添加多张图片 | `addFiles_cb` | `ImageList.vue` + `fileDialog.ts` | 是 | 保留 png/jpg/tif/bmp，多选系统对话框 |
| 删除图片/清空图片 | `removeRow_cb`、`clearFiles_cb` | `imageStore.ts`、`ImageList.vue` | 是 | 选中项删除，清空后状态同步 |
| 上移/下移/拖拽排序 | `moveSelectedFile_cb`、`colorexchange_order_drag.html` | `SortableJS` + `imageStore.reorder` | 是 | 拖拽后自动重编 `(a)(b)` 前缀 |
| 选中图片 | `orderHtmlDataChanged_cb select` | `selectedId` | 是 | 点击卡片选中 |
| 标签编辑 | `editLabel`、`fileTableEdited_cb` | `ImageCard.vue` 双击标签 | 是 | 保留用户自定义文本，重排时仅更新前缀 |
| 黑电平校正 | `safePrctile(im(:), pLow)` | `image_pipeline.py` | 是 | NumPy percentile 向量化，默认 1% |
| 阈值处理 | `im(im <= threshold)=0` | `image_pipeline.py` | 是 | 语义保持为 `<=` 置零 |
| 每图归一化 | `normCB` | `normalizeMode=perImage` | 是 | 每张图独立 min-max |
| 分位数归一化 | `pctNormCB` | `normalizeMode=percentile` | 是 | 1% 到 99.5%，裁剪到 0-1 |
| 统一正方形尺寸 | `S=max(H,W)` + `imresize` + 中心裁剪 | `resize_center_crop_square` | 是 | 保持 MATLAB 最终 tile 尺寸逻辑 |
| colormap | `feval(cmapName,256)` | `colormap_utils.py` | 是 | 支持原列表，额外支持 viridis/plasma 等 |
| 单图伪彩色转换 | `singleConvert_cb` | `convertSingle` IPC + `save_single_pseudocolor` | 是 | 无标签无色条，按同一 CLim 映射 |
| 多图拼接 | `tiledlayout` + `imagesc` | `mosaic_renderer.py` GridSpec | 是 | 无缝 tile、指定列数、自动行数 |
| 标签绘制 | `text(ax,0.02,0.96,...)` | Matplotlib `ax.text` | 是 | 位置、字体、自适应字号保持 |
| 行/列分隔线 | `annotation line` | Matplotlib figure lines | 是 | 默认行分隔线开，列分隔线关 |
| MATLAB 风格色条 | 手动 `imagesc` 色条 | Matplotlib `ScalarMappable + colorbar` | 是 | cmap/norm 与图像严格共用 |
| DPI/格式导出 | `exportgraphics/print` | `fig.savefig` | 是 | png/tif/jpg/pdf，72-1200 DPI |
| 预览结果窗口 | MATLAB figure | `PreviewPanel.vue` | 是 | 新增缩放、拖拽、适配、100% |

## 开发运行

```bash
cd color-exchange-electron
python3 -m pip install -r python/requirements.txt
npm install
npm run dev
```

如需指定 Python，可设置：

```bash
export COLOREXCHANGE_PYTHON=/path/to/python
```

## 打包

```bash
npm run build
npm run dist
```

## Windows 完整安装包

macOS 不能可靠地直接生成 Windows 可用的 Python 后端 exe。推荐用 GitHub Actions 或 Windows 虚拟机打包。

### GitHub Actions

把项目推到 GitHub 后，打开 Actions，手动运行 `Build Windows Installer`。对应 workflow 文件是 [.github/workflows/windows-installer.yml](.github/workflows/windows-installer.yml)。完成后在 workflow artifact 里下载 `ColorExchange-Windows`。

这个流程会在 Windows runner 中执行：

```powershell
.\scripts\build-backend-win.ps1
npm run dist:win
```

生成物在 `dist/`，包括 NSIS 安装包 `.exe`。安装包内会包含 `dist-python/colorexchange-backend.exe`，目标 Windows 电脑不需要额外安装 Python。

如果你想直接发布到 GitHub Release，可以先用 tag 触发 workflow，再把 `dist/` 里的安装包作为 release 资产上传。

### Windows 本机或虚拟机

```powershell
cd color-exchange-electron
npm ci
.\scripts\build-backend-win.ps1
npm run dist:win
```

## 迁移验证检查表

| 功能 | MATLAB 原功能 | 新版本是否实现 | 对应文件 | 注意事项 |
|---|---|---|---|---|
| 图片添加 | 支持多选 | 已实现 | `ImageList.vue`、`fileDialog.ts` | 系统文件对话框 |
| 图片删除 | 指定行删除 | 已实现 | `imageStore.ts` | 当前选中删除 |
| 图片拖拽排序 | HTML 行拖拽 | 已实现 | `ImageList.vue` | SortableJS |
| 标签编辑 | 双击表格/HTML 标签 | 已实现 | `ImageCard.vue` | 双击标签编辑 |
| 图片预览 | 结果 figure | 已增强 | `PreviewPanel.vue` | 支持缩放/拖拽 |
| 图片缩放 | 原 App 不完整 | 已新增 | `ImageEditorDialog.vue` | 大图编辑窗口 |
| 单图伪彩色转换 | 已有 | 已实现 | `image_pipeline.py` | 同 CLim/cmap |
| 多图拼图 | 已有 | 已实现 | `mosaic_renderer.py` | GridSpec 无缝布局 |
| colormap | 原 MATLAB 列表 | 已实现 | `colormap_utils.py` | parula 为近似实现 |
| CLim | `caxis(CLIM)` | 已实现 | `mosaic_renderer.py` | Normalize 共用 |
| 阈值 | `<=th` 置零 | 已实现 | `image_pipeline.py` | 语义一致 |
| 黑电平校正 | 分位数扣除 | 已实现 | `image_pipeline.py` | NumPy 向量化 |
| 归一化方式 | 绝对/每图/分位数 | 已实现 | `schemas.py`、`image_pipeline.py` | JSON 可序列化 |
| 标签绘制 | tile 左上角 | 已实现 | `mosaic_renderer.py` | 字号自适应 |
| MATLAB 风格色条 | 右侧白色刻度 | 已实现 | `mosaic_renderer.py` | 使用 Matplotlib 原生 colorbar |
| 色条映射一致 | `imagesc + caxis` | 已实现 | `mosaic_renderer.py` | 同一个 `cmap` 和 `norm` |
| 高 DPI 导出 | 300/600/1200 | 已实现 | `mosaic_renderer.py` | `savefig(dpi=...)` |
| 跨平台路径 | `fullfile` | 已实现 | `fileDialog.ts`、`pythonBridge.ts` | JSON 传绝对路径 |
| Python 错误反馈 | MATLAB alert | 已实现 | `process.py`、`App.vue` | 返回 JSON error |
| 论文/PPT 输出 | 高分辨率图片 | 已实现 | `mosaic_renderer.py` | 去掉明显边距 |

## 重构优化说明

| 原实现方式 | 新实现方式 | 为什么这样优化 | 是否影响原功能 | 如何验证 |
|---|---|---|---|---|
| App Designer 固定像素 UI | Vue 组件化三栏布局 | 更适合跨平台桌面和后续扩展 | 不影响 | 逐项检查控件和操作 |
| `uihtml` 自写拖拽表格 | SortableJS 图片卡片列表 | 减少 MATLAB 通信耦合，保留拖拽/选择/标签 | 不影响 | 拖拽后顺序和标签前缀更新 |
| MATLAB 逐步矩阵处理 | NumPy/OpenCV/Pillow pipeline | 更快、更稳定，支持更多图像格式 | 不影响 | 对比黑电平、阈值、归一化输出 |
| 手写色条 axes | Matplotlib `ScalarMappable + colorbar` | 科学绘图标准流程，映射关系更清晰 | 视觉接近且映射更严格 | 检查 image 和 colorbar 共用 `cmap/norm` |
| `tiledlayout` | Matplotlib GridSpec | 精准控制右侧色条区和无缝 tile | 不影响 | 导出检查无明显边框 |
| `exportgraphics` | `savefig` DPI/格式 | 跨平台、可打包 | 不影响 | 检查像素尺寸和文件格式 |
| 无独立大图编辑 | 新增预览/编辑 dialog | 满足缩放、平移、100% 需求 | 增强功能 | 手动打开选中图验证 |
| MATLAB `fullfile` | Electron 对话框 + JSON 路径 | 跨 Windows/macOS/Linux | 不影响 | 含空格路径测试 |
| MATLAB 异常弹窗 | Python JSON error + 前端日志 | 便于定位后端错误 | 不影响 | 传入坏路径测试 |

## 色条一致性说明

`mosaic_renderer.py` 中每个 tile 使用：

```python
ax.imshow(arr, cmap=cmap, norm=norm)
```

右侧色条使用同一个对象关系：

```python
sm = cm.ScalarMappable(cmap=cmap, norm=norm)
fig.colorbar(sm, cax=cax)
```

因此图像颜色、CLim、tick 数值和色条颜色来自同一个 Matplotlib `Normalize(vmin, vmax)` 与同一个 colormap，不使用 CSS 渐变，也不使用独立伪造色条。
