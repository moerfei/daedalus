# -*- coding: utf-8 -*-
"""daedalus 插件图标绘制（扁平几何：方形螺旋迷宫 + 金色羽翼）

产出 assets/icon.png（圆角方块应用图标）、logo.png（浅色背景用，透明底）、
logo-dark.png（深色背景用，透明底）。4x 超采样抗锯齿，最终 512px。
运行：python assets/draw_icon.py
"""
import math
import os

from PIL import Image, ImageDraw

SIZE = 2048          # 超采样画布
OUT = 512            # 输出尺寸
NAVY = (46, 74, 120, 255)        # 爱琴海军蓝（图标底）
LIGHT = (238, 242, 248, 255)     # 米白（迷宫亮色）
NAVY_SUB = (46, 74, 120, 255)    # logo 浅底版用深蓝主体
GOLD = (233, 166, 60, 255)       # 琥珀金（羽翼）

CX, CY = 860, 1200    # 迷宫中心
H = 560               # 迷宫外半宽
GAP = 265             # 每圈收缩（加大圈距，小尺寸下每圈更清晰）
STROKE = 130          # 迷宫线宽（加粗提升辨识度）
TURNS = 2
ENTRANCE = 150        # 底边入口缺口（起点内收，圆头对齐成"门"）

# 三片羽翼：(长度, 宽度, 顺时针角度deg, 锚点)——根部向迷宫中心聚拢成扇
FEATHERS = [
    (760, 170, 24, (875, 1100)),
    (900, 195, 47, (860, 1175)),
    (700, 160, 70, (848, 1245)),
]


def square_spiral(cx, cy, h, gap, turns, entrance=0):
    """顺时针内收的方形螺旋折线点列；起点沿底边内收 entrance 形成迷宫入口。"""
    pts = [(cx - h + entrance, cy + h)]
    x, y = pts[0]
    L = 2 * h - entrance
    x += L
    pts.append((x, y))
    y -= L
    pts.append((x, y))
    for _ in range(turns):
        L -= gap
        x -= L
        pts.append((x, y))
        L -= gap
        y += L
        pts.append((x, y))
        L -= gap
        x += L
        pts.append((x, y))
        L -= gap
        y -= L
        pts.append((x, y))
    return pts


def draw_maze(draw, color):
    pts = square_spiral(CX, CY, H, GAP, TURNS, ENTRANCE)
    draw.line(pts, fill=color, width=STROKE, joint="curve")
    # 线端圆头
    for p in (pts[0], pts[-1]):
        r = STROKE / 2
        draw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=color)


def feather(length, width, angle_cw):
    """竖直向上的胶囊羽翼图层，再顺时针旋转。"""
    pad = 40
    w, h = width + pad * 2, length + pad * 2
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle(
        [pad, pad, pad + width, pad + length], radius=width / 2, fill=GOLD
    )
    return layer.rotate(angle_cw, expand=True, resample=Image.BICUBIC)


def compose(bg_fill=None, maze_color=LIGHT, out_name="icon.png"):
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    if bg_fill is not None:
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([0, 0, SIZE, SIZE], radius=230, fill=bg_fill)
    # 羽翼先铺，迷宫压在其根部之上
    for length, width, ang, (ax, ay) in FEATHERS:
        f = feather(length, width, ang)
        # 胶囊底端中点（旋转 expand 后底端=原图 (w/2, h-pad)）
        base_local = ((f.width) / 2, f.height - 40)
        img.alpha_composite(f, (int(ax - base_local[0]), int(ay - base_local[1])))
    draw_maze(ImageDraw.Draw(img), maze_color)
    icon = img.resize((OUT, OUT), Image.LANCZOS)
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), out_name)
    icon.save(path)
    print("saved", path, icon.size)


if __name__ == "__main__":
    compose(NAVY, LIGHT, "icon.png")            # 应用图标：军蓝底 + 米白迷宫 + 金翼
    compose(None, NAVY_SUB, "logo.png")         # 浅色背景：深蓝主体 + 金翼
    compose(None, LIGHT, "logo-dark.png")       # 深色背景：米白主体 + 金翼
