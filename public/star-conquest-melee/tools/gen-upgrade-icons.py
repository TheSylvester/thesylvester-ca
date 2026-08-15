#!/usr/bin/env python3
"""Deterministically render the post-wave shop upgrade icons."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


SIZE = 192
SCALE = 4
HI_SIZE = SIZE * SCALE
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "assets" / "ui" / "upgrades"

TRANSPARENT = (0, 0, 0, 0)
CLAY = (0xD9, 0x77, 0x57, 0xFF)
WARM_WHITE = (0xF2, 0xF3, 0xF5, 0xFF)
SLATE = (0x9A, 0xA3, 0xB2, 0xFF)
DIM = (0x5C, 0x63, 0x70, 0xFF)
RULE = (0x31, 0x3A, 0x4E, 0xFF)
PANEL = (0x0E, 0x11, 0x19, 0xFF)
SURROUND = (0x12, 0x15, 0x1F, 0xFF)
PALETTE = {CLAY, WARM_WHITE, SLATE, DIM, RULE, PANEL, SURROUND}

# The detailed coordinates include a few shapes that would otherwise cross the
# hard six-pixel margin. Only their overflowing extremities are brought into
# this safe authored area; all other supplied coordinates remain unchanged.
SAFE_MIN = 6
SAFE_MAX = SIZE - 6


def px(value: float) -> int:
    """Scale a final-space coordinate to the supersampled canvas."""

    return round(value * SCALE)


def new_icon() -> Image.Image:
    return Image.new("RGBA", (HI_SIZE, HI_SIZE), TRANSPARENT)


def rectangle(
    draw: ImageDraw.ImageDraw,
    box: tuple[float, float, float, float],
    fill: tuple[int, int, int, int],
) -> None:
    """Draw an exact half-open final-space rectangle."""

    left, top, right, bottom = box
    draw.rectangle(
        (px(left), px(top), px(right) - 1, px(bottom) - 1),
        fill=fill,
    )


def polygon(
    draw: ImageDraw.ImageDraw,
    points: list[tuple[float, float]],
    fill: tuple[int, int, int, int],
) -> None:
    draw.polygon([(px(x), px(y)) for x, y in points], fill=fill)


def circle(
    draw: ImageDraw.ImageDraw,
    center: tuple[float, float],
    radius: float,
    fill: tuple[int, int, int, int],
) -> None:
    cx, cy = center
    draw.ellipse(
        (
            px(cx - radius),
            px(cy - radius),
            px(cx + radius) - 1,
            px(cy + radius) - 1,
        ),
        fill=fill,
    )


def outlined_square(
    image: Image.Image,
    center: tuple[float, float],
    size: float,
    width: float,
    color: tuple[int, int, int, int],
) -> None:
    """Draw a square outline without introducing a background color."""

    cx, cy = center
    half = size / 2
    layer = Image.new("RGBA", image.size, TRANSPARENT)
    draw = ImageDraw.Draw(layer)
    rectangle(draw, (cx - half, cy - half, cx + half, cy + half), color)
    rectangle(
        draw,
        (
            cx - half + width,
            cy - half + width,
            cx + half - width,
            cy + half - width,
        ),
        TRANSPARENT,
    )
    image.alpha_composite(layer)


def ring(
    image: Image.Image,
    center: tuple[float, float],
    radius: float,
    width: float,
    color: tuple[int, int, int, int],
) -> None:
    """Draw a centered circular stroke as two flat, hard-edged discs."""

    layer = Image.new("RGBA", image.size, TRANSPARENT)
    draw = ImageDraw.Draw(layer)
    circle(draw, center, radius + width / 2, color)
    circle(draw, center, radius - width / 2, TRANSPARENT)
    image.alpha_composite(layer)


def plus_sign(
    draw: ImageDraw.ImageDraw,
    center: tuple[float, float],
    length: float,
    thickness: float,
    color: tuple[int, int, int, int],
) -> None:
    cx, cy = center
    half_length = length / 2
    half_thickness = thickness / 2
    rectangle(
        draw,
        (cx - half_length, cy - half_thickness, cx + half_length, cy + half_thickness),
        color,
    )
    rectangle(
        draw,
        (cx - half_thickness, cy - half_length, cx + half_thickness, cy + half_length),
        color,
    )


def draw_house_ship(
    image: Image.Image,
    center: tuple[float, float],
    radius: float,
) -> None:
    draw = ImageDraw.Draw(image)
    circle(draw, center, radius, WARM_WHITE)

    cx, cy = center
    dot_radius = radius * 0.17
    dot_ring_radius = radius * 0.63
    for index in range(8):
        angle = math.radians(index * 45)
        dot_center = (
            cx + math.cos(angle) * dot_ring_radius,
            cy + math.sin(angle) * dot_ring_radius,
        )
        circle(draw, dot_center, dot_radius, CLAY)
    circle(draw, center, dot_radius * 1.2, CLAY)


def rapid_loader() -> Image.Image:
    image = new_icon()
    draw = ImageDraw.Draw(image)

    rectangle(draw, (22, 40, 30, 152), WARM_WHITE)
    for center_y in (56, 96, 136):
        rectangle(draw, (6, center_y - 2, 16, center_y + 2), DIM)

    for length, center_y in zip((78, 108, 138), (56, 96, 136), strict=True):
        right = 30 + length
        rectangle(draw, (30, center_y - 7, right, center_y + 7), CLAY)
        tip_x = min(right + 20, SAFE_MAX)
        polygon(
            draw,
            [(right, center_y - 13), (tip_x, center_y), (right, center_y + 13)],
            CLAY,
        )
    return image


def afterburner() -> Image.Image:
    image = new_icon()
    draw = ImageDraw.Draw(image)

    # The middle streak would sit on the flame axis, so retain the two clean
    # outer streaks at the corrected vertical positions.
    streak_right = 40
    for length, center_y in ((26, 52), (26, 140)):
        rectangle(
            draw,
            (streak_right - length, center_y - 2, streak_right, center_y + 2),
            DIM,
        )

    cx, cy = 110, 96
    radius = 42
    hull_left = cx - radius
    outer_width = radius * 1.00
    outer_length = radius * 1.05
    flame_apex_x = hull_left - outer_length
    polygon(
        draw,
        [
            (hull_left, cy - outer_width / 2),
            (flame_apex_x, cy),
            (hull_left, cy + outer_width / 2),
        ],
        CLAY,
    )
    inner_width = outer_width * 0.45
    inner_length = outer_length * 0.45
    polygon(
        draw,
        [
            (hull_left, cy - inner_width / 2),
            (hull_left - inner_length, cy),
            (hull_left, cy + inner_width / 2),
        ],
        WARM_WHITE,
    )
    draw_house_ship(image, (cx, cy), radius)
    return image


def hull_patch() -> Image.Image:
    image = new_icon()
    draw = ImageDraw.Draw(image)

    outlined_square(image, (28, 96), 28, 4, RULE)
    outlined_square(image, (164, 96), 28, 4, RULE)
    rectangle(draw, (48, 48, 144, 144), CLAY)
    plus_sign(draw, (96, 96), 68, 20, WARM_WHITE)
    return image


def max_hull() -> Image.Image:
    image = new_icon()
    draw = ImageDraw.Draw(image)

    for center_x in (30, 74, 118):
        rectangle(draw, (center_x - 17, 69, center_x + 17, 103), CLAY)
    outlined_square(image, (162, 86), 34, 5, CLAY)
    plus_sign(draw, (162, 86), 20, 6, CLAY)
    rectangle(draw, (22, 138, 170, 142), DIM)
    return image


FONT_CANDIDATES = (
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"),
    Path("/usr/share/fonts/truetype/liberation2/LiberationMono-Bold.ttf"),
    Path("/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf"),
)


def load_monospace_font() -> ImageFont.FreeTypeFont | None:
    for path in FONT_CANDIDATES:
        if not path.is_file():
            continue
        try:
            return ImageFont.truetype(
                str(path),
                26 * SCALE,
                layout_engine=ImageFont.Layout.BASIC,
            )
        except OSError:
            continue
    return None


BLOCK_LETTERS = {
    "Q": ("01110", "10001", "10001", "10001", "10101", "10010", "01101"),
    "W": ("10001", "10001", "10101", "10101", "10101", "11011", "10001"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
    "D": ("11110", "10001", "10001", "10001", "10001", "10001", "11110"),
    "Z": ("11111", "00001", "00010", "00100", "01000", "10000", "11111"),
    "X": ("10001", "10001", "01010", "00100", "01010", "10001", "10001"),
    "C": ("01111", "10000", "10000", "10000", "10000", "10000", "01111"),
}


def draw_block_letter(
    draw: ImageDraw.ImageDraw,
    letter: str,
    center_x: float,
    top: float,
) -> None:
    cell = 3
    left = center_x - 2.5 * cell
    for row, bits in enumerate(BLOCK_LETTERS[letter]):
        for column, bit in enumerate(bits):
            if bit == "1":
                rectangle(
                    draw,
                    (
                        left + column * cell,
                        top + row * cell,
                        left + (column + 1) * cell,
                        top + (row + 1) * cell,
                    ),
                    SLATE,
                )


def draw_letter(
    image: Image.Image,
    letter: str,
    center_x: float,
    top: float,
    font: ImageFont.FreeTypeFont | None,
) -> None:
    if font is None:
        draw_block_letter(ImageDraw.Draw(image), letter, center_x, top)
        return

    # A 1-bit mask deliberately disables FreeType edge smoothing. LANCZOS is
    # therefore still the only antialiasing pass in the generator.
    mask = Image.new("1", image.size, 0)
    mask_draw = ImageDraw.Draw(mask)
    bounds = mask_draw.textbbox((0, 0), letter, font=font)
    glyph_width = bounds[2] - bounds[0]
    x = px(center_x) - glyph_width // 2 - bounds[0]
    y = px(top) - bounds[1]
    mask_draw.text((x, y), letter, font=font, fill=1)
    image.paste(SLATE, (0, 0, HI_SIZE, HI_SIZE), mask)


def arrow_triangle(
    draw: ImageDraw.ImageDraw,
    center: tuple[float, float],
    direction: tuple[float, float],
) -> None:
    dx, dy = direction
    magnitude = math.hypot(dx, dy)
    ux, uy = dx / magnitude, dy / magnitude
    vx, vy = -uy, ux
    cx, cy = center
    half_length = 11
    half_width = 6
    tip = (cx + ux * half_length, cy + uy * half_length)
    base_center = (cx - ux * half_length, cy - uy * half_length)
    base_a = (base_center[0] + vx * half_width, base_center[1] + vy * half_width)
    base_b = (base_center[0] - vx * half_width, base_center[1] - vy * half_width)
    polygon(draw, [base_a, tip, base_b], CLAY)


def thrust_ring() -> Image.Image:
    image = new_icon()
    centers = (40, 96, 152)
    for center_y in centers:
        for center_x in centers:
            outlined_square(image, (center_x, center_y), 52, 4, SLATE)

    font = load_monospace_font()
    rows = (
        (("Q", (-1, -1)), ("W", (0, -1)), ("E", (1, -1))),
        (("A", (-1, 0)), ("S", (0, 1)), ("D", (1, 0))),
        (("Z", (-1, 1)), ("X", (0, 1)), ("C", (1, 1))),
    )
    draw = ImageDraw.Draw(image)
    for row_index, row in enumerate(rows):
        center_y = centers[row_index]
        for column_index, (letter, direction) in enumerate(row):
            center_x = centers[column_index]
            draw_letter(image, letter, center_x, center_y - 22, font)
            arrow_triangle(draw, (center_x, center_y + 9), direction)
    return image


def blast_charge() -> Image.Image:
    image = new_icon()
    draw = ImageDraw.Draw(image)
    cx, cy = 96, 96

    for index in range(8):
        angle = math.radians(index * 45)
        ux, uy = math.cos(angle), math.sin(angle)
        vx, vy = -uy, ux
        base_center = (cx + ux * 68, cy + uy * 68)
        base_a = (base_center[0] + vx * 7, base_center[1] + vy * 7)
        base_b = (base_center[0] - vx * 7, base_center[1] - vy * 7)
        tip = (cx + ux * 84, cy + uy * 84)
        polygon(draw, [base_a, tip, base_b], CLAY)

    ring(image, (cx, cy), 37, 6, CLAY)
    ring(image, (cx, cy), 60, 6, CLAY)

    draw = ImageDraw.Draw(image)
    for index in range(8):
        angle = math.radians(22.5 + index * 45)
        dot_center = (cx + math.cos(angle) * 25, cy + math.sin(angle) * 25)
        circle(draw, dot_center, 4, DIM)
    circle(draw, (cx, cy), 13, WARM_WHITE)
    return image


GENERATORS = (
    ("rapid-loader.png", rapid_loader),
    ("afterburner.png", afterburner),
    ("hull-patch.png", hull_patch),
    ("max-hull.png", max_hull),
    ("thrust-ring.png", thrust_ring),
    ("blast-charge.png", blast_charge),
)


def authored_colors(image: Image.Image, name: str) -> set[tuple[int, int, int, int]]:
    pixels = image.get_flattened_data()
    colors = {pixel for pixel in pixels if pixel[3] != 0}
    unexpected = colors - PALETTE
    if unexpected:
        raise AssertionError(f"{name}: authored pixels outside the seven-color palette: {unexpected}")
    if any(pixel[3] not in (0, 255) for pixel in pixels):
        raise AssertionError(f"{name}: authored alpha must be either 0 or 255")
    return colors


def opaque_near_edge(image: Image.Image, border: int = 5) -> bool:
    alpha = image.getchannel("A")
    width, height = image.size
    for y in range(height):
        for x in range(border):
            if alpha.getpixel((x, y)) == 255 or alpha.getpixel((width - 1 - x, y)) == 255:
                return True
    for x in range(width):
        for y in range(border):
            if alpha.getpixel((x, y)) == 255 or alpha.getpixel((x, height - 1 - y)) == 255:
                return True
    return False


def verify(
    rendered: list[tuple[str, Path, int]],
) -> None:
    failures: list[str] = []
    for name, path, color_count in rendered:
        with Image.open(path) as image:
            image.load()
            width, height = image.size
            alpha = image.getchannel("A")
            opaque_pixels = sum(value > 200 for value in alpha.get_flattened_data())
            print(
                f"{name} {width}x{height} mode={image.mode} "
                f"opaque_px={opaque_pixels} distinct_authored_colors={color_count}"
            )

            if image.size != (SIZE, SIZE):
                failures.append(f"{name}: expected {SIZE}x{SIZE}, got {width}x{height}")
            if image.mode != "RGBA":
                failures.append(f"{name}: expected mode RGBA, got {image.mode}")
            corners = ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1))
            if any(image.getpixel(point)[3] != 0 for point in corners):
                failures.append(f"{name}: all four corner pixels must have alpha 0")
            if opaque_pixels < 3000:
                failures.append(f"{name}: only {opaque_pixels} pixels have alpha > 200 (need 3000)")
            if opaque_near_edge(image):
                failures.append(f"{name}: a fully opaque pixel lies within 5 px of an edge")

    if failures:
        raise SystemExit("upgrade icon verification failed:\n- " + "\n- ".join(failures))


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    rendered: list[tuple[str, Path, int]] = []
    for name, generator in GENERATORS:
        supersampled = generator()
        colors = authored_colors(supersampled, name)
        final = supersampled.resize((SIZE, SIZE), resample=Image.Resampling.LANCZOS)
        path = OUTPUT_DIR / name
        final.save(path, format="PNG", optimize=False, compress_level=9)
        rendered.append((name, path, len(colors)))
    verify(rendered)


if __name__ == "__main__":
    main()
