#!/usr/bin/env python3
"""Gera os ícones PNG da app (192, 512 e 512 maskable) a partir de geometria,
sem dependências externas. Correr uma vez:  python icons/make_icons.py
Desenha um quadrado arredondado índigo com o símbolo "€" branco."""
import math, os, struct, zlib

THEME = (0x4f, 0x46, 0xe5)   # índigo
DIR = os.path.dirname(os.path.abspath(__file__))


def in_rounded_rect(x, y, W, rad):
    if x < 0 or y < 0 or x > W or y > W:
        return False
    if x < rad and y < rad:           return (x - rad) ** 2 + (y - rad) ** 2 <= rad * rad
    if x > W - rad and y < rad:       return (x - (W - rad)) ** 2 + (y - rad) ** 2 <= rad * rad
    if x < rad and y > W - rad:       return (x - rad) ** 2 + (y - (W - rad)) ** 2 <= rad * rad
    if x > W - rad and y > W - rad:   return (x - (W - rad)) ** 2 + (y - (W - rad)) ** 2 <= rad * rad
    return True


def render(W, maskable):
    """Devolve um bytearray RGBA WxW (arestas duras; suavizadas no downsample)."""
    buf = bytearray(W * W * 4)
    cx, cy = 0.5 * W, 0.52 * W
    R, T = 0.30 * W, 0.085 * W
    inner = R - T
    gap = math.radians(52)            # abertura do "€" à direita
    tbar = 0.072 * W
    barL, barR = cx - 0.34 * W, cx + 0.06 * W
    bar1, bar2 = cy - 0.07 * W, cy + 0.07 * W
    rad = 0.0 if maskable else 0.22 * W
    cr, cg, cb = THEME
    for y in range(W):
        for x in range(W):
            px, py = x + 0.5, y + 0.5
            if not (maskable or in_rounded_rect(px, py, W, rad)):
                continue
            r, g, b, a = cr, cg, cb, 255
            dx, dy = px - cx, py - cy
            dist = math.hypot(dx, dy)
            ring = inner <= dist <= R and abs(math.atan2(dy, dx)) > gap
            in_bar = (barL <= px <= barR) and (abs(py - bar1) <= tbar / 2 or abs(py - bar2) <= tbar / 2)
            if ring or in_bar:
                r, g, b = 255, 255, 255
            i = (y * W + x) * 4
            buf[i], buf[i + 1], buf[i + 2], buf[i + 3] = r, g, b, a
    return buf


def downsample2(buf, W):
    """Reduz para metade com média ponderada por alfa (suaviza arestas)."""
    H = W // 2
    out = bytearray(H * H * 4)
    for y in range(H):
        for x in range(H):
            ta = tr = tg = tb = 0
            for dy in (0, 1):
                for dx in (0, 1):
                    i = ((2 * y + dy) * W + (2 * x + dx)) * 4
                    a = buf[i + 3]
                    ta += a; tr += buf[i] * a; tg += buf[i + 1] * a; tb += buf[i + 2] * a
            o = (y * H + x) * 4
            out[o + 3] = ta // 4
            if ta:
                out[o], out[o + 1], out[o + 2] = tr // ta, tg // ta, tb // ta
    return out, H


def write_png(path, W, buf):
    def chunk(typ, data):
        return struct.pack(">I", len(data)) + typ + data + struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff)
    raw = bytearray()
    stride = W * 4
    for y in range(W):
        raw.append(0)
        raw += buf[y * stride:(y + 1) * stride]
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", W, W, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    print("escrito", os.path.basename(path))


def make(name, size, maskable=False):
    buf, W = downsample2(render(size * 2, maskable), size * 2)   # supersampling x2
    write_png(os.path.join(DIR, name), W, buf)


if __name__ == "__main__":
    make("icon-192.png", 192)
    make("icon-512.png", 512)
    make("icon-512-maskable.png", 512, maskable=True)
    print("Ícones gerados em", DIR)
