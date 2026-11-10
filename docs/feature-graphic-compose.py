#!/usr/bin/env python3
"""Compose the School Saathi Play Store feature graphic (1024 x 500).

Takes ONE real app screenshot plus the school logo and composes the
1024x500 feature graphic:
  - left:  school logo + "School Saathi" + tagline
            "Smart Education. Better Tomorrow." on the app theme colour
  - right: the real screenshot, scaled to fit (never stretched, never
           cropped beyond a centre crop to the slot's aspect ratio)

This script NEVER invents app UI. The only app imagery in the output is
the real screenshot file passed with --screenshot. Without a real
screenshot input it refuses to run (clean error, non-zero exit).

Usage:
    python3 docs/feature-graphic-compose.py \
        --screenshot screenshots/02-dashboard.png \
        --logo icons/icon-512.png \
        --output screenshots/feature-graphic.png

Logo input must be a PNG (PIL cannot rasterise SVG). The repo's source
logo is icons/logo.svg -- export it to PNG first, or pass the shipped
raster logo icons/icon-512.png. Passing an .svg path is rejected with a
clear message.

Requires: Pillow (PIL). No other dependency.
"""

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1024, 500
THEME = (10, 30, 75)        # #0A1E4B -- manifest.json theme_color
THEME_LIGHT = (16, 48, 120)  # subtle panel behind the screenshot
TEXT = (255, 255, 255)
MUTED = (176, 196, 230)
ACCENT = (255, 176, 32)     # warm accent bar under the title

APP_NAME = "School Saathi"
TAGLINE = "Smart Education. Better Tomorrow."


def fail(message):
    """Print a clean error to stderr and exit non-zero."""
    print("error: %s" % message, file=sys.stderr)
    sys.exit(1)


def load_font(size, bold=False):
    """Best-effort font lookup; falls back to PIL's built-in bitmap font."""
    candidates = []
    if bold:
        candidates += [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
        ]
    else:
        candidates += [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/TTF/DejaVuSans.ttf",
        ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Compose the 1024x500 School Saathi feature graphic "
                    "from ONE real app screenshot + the school logo."
    )
    parser.add_argument(
        "--screenshot", required=True,
        help="Path to a REAL app screenshot (PNG or JPEG). Required -- "
             "the script refuses to run without one.",
    )
    parser.add_argument(
        "--logo", default="icons/icon-512.png",
        help="Path to a PNG logo (default: icons/icon-512.png). "
             "SVG is not accepted: export icons/logo.svg to PNG first.",
    )
    parser.add_argument(
        "--output", default="screenshots/feature-graphic.png",
        help="Output path for the 1024x500 PNG "
             "(default: screenshots/feature-graphic.png).",
    )
    args = parser.parse_args(argv)

    screenshot_path = Path(args.screenshot)
    logo_path = Path(args.logo)
    output_path = Path(args.output)

    # ---- refuse to run without a real screenshot input -------------------
    if not screenshot_path.is_file():
        fail(
            "no real screenshot found at '%s' -- a real app screenshot is "
            "required. Capture one first (see "
            "docs/screenshots-shot-list.md); this script never generates "
            "or fakes app UI." % screenshot_path
        )
    if screenshot_path.suffix.lower() not in (".png", ".jpg", ".jpeg"):
        fail(
            "screenshot '%s' is not a PNG/JPEG image -- pass a real "
            "screenshot file." % screenshot_path
        )
    if logo_path.suffix.lower() == ".svg":
        fail(
            "logo '%s' is an SVG and PIL cannot rasterise SVG -- export "
            "icons/logo.svg to PNG first (or pass icons/icon-512.png) and "
            "retry." % logo_path
        )
    if not logo_path.is_file():
        fail("logo file not found at '%s'." % logo_path)

    try:
        shot = Image.open(screenshot_path)
        shot.load()
    except Exception as exc:  # unreadable / not an image at all
        fail("could not read screenshot '%s' as an image (%s) -- pass a "
             "real screenshot file." % (screenshot_path, exc))
    if shot.format not in ("PNG", "JPEG"):
        fail("screenshot '%s' is %s, not PNG/JPEG -- pass a real "
             "screenshot file." % (screenshot_path, shot.format))

    try:
        logo = Image.open(logo_path).convert("RGBA")
        logo.load()
    except Exception as exc:
        fail("could not read logo '%s' as an image (%s)." % (logo_path, exc))

    # ---- canvas ----------------------------------------------------------
    canvas = Image.new("RGB", (WIDTH, HEIGHT), THEME)
    draw = ImageDraw.Draw(canvas)

    # ---- screenshot slot (right ~46% of the canvas) ----------------------
    slot_x0, slot_y0 = 560, 20
    slot_x1, slot_y1 = WIDTH - 20, HEIGHT - 20
    slot_w, slot_h = slot_x1 - slot_x0, slot_y1 - slot_y0
    draw.rounded_rectangle(
        [slot_x0 - 6, slot_y0 - 6, slot_x1 + 6, slot_y1 + 6],
        radius=18, fill=THEME_LIGHT,
    )
    # Centre-crop the shot to the slot aspect (no stretching), then paste.
    shot_ratio = shot.width / shot.height
    slot_ratio = slot_w / slot_h
    if shot_ratio > slot_ratio:  # too wide: crop left/right
        new_w = int(shot.height * slot_ratio)
        left = (shot.width - new_w) // 2
        shot = shot.crop((left, 0, left + new_w, shot.height))
    else:  # too tall: crop top/bottom
        new_h = int(shot.width / slot_ratio)
        top = (shot.height - new_h) // 2
        shot = shot.crop((0, top, shot.width, top + new_h))
    shot = shot.resize((slot_w, slot_h), Image.LANCZOS).convert("RGB")
    mask = Image.new("L", (slot_w, slot_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, slot_w, slot_h], radius=14, fill=255
    )
    canvas.paste(shot, (slot_x0, slot_y0), mask)

    # ---- logo + text (left side) -----------------------------------------
    logo_size = 120
    logo_img = logo.resize((logo_size, logo_size), Image.LANCZOS)
    logo_y = 92
    canvas.paste(logo_img, (56, logo_y), logo_img)

    title_font = load_font(64, bold=True)
    tag_font = load_font(26)
    # Shrink the title until it fits the left column.
    text_x = 56
    title = APP_NAME
    while title_font.getlength(title) > 460 and title_font.size > 28:
        title_font = load_font(title_font.size - 4, bold=True)
    draw.text((text_x, logo_y + logo_size + 24), title,
              font=title_font, fill=TEXT)
    # Accent bar under the title.
    title_bottom = logo_y + logo_size + 24 + title_font.size + 14
    draw.rectangle([text_x, title_bottom, text_x + 120, title_bottom + 6],
                   fill=ACCENT)
    # Tagline, wrapped to the left column if needed.
    tag = TAGLINE
    while tag_font.getlength(tag) > 460 and tag_font.size > 16:
        tag_font = load_font(tag_font.size - 2)
    draw.text((text_x, title_bottom + 26), tag, font=tag_font, fill=MUTED)

    # ---- write output ------------------------------------------------------
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(output_path, format="PNG")
    except Exception as exc:
        fail("could not write output '%s' (%s)." % (output_path, exc))

    print("wrote %s (1024x500) from screenshot %s + logo %s"
          % (output_path, screenshot_path, logo_path))
    return 0


if __name__ == "__main__":
    sys.exit(main())
