"""Build the app's display faces from Oswald Soft. Requires FontTools."""

from array import array
from hashlib import blake2s
from pathlib import Path

from fontTools.misc.roundTools import otRound
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphCoordinates, flagOnCurve, flagOverlapSimple
from fontTools.ttLib.tables.ttProgram import Program

FONT_DIR = Path(__file__).resolve().parents[1] / "apps" / "mobile" / "assets" / "fonts"
FAMILY = "MVP Marker"


def draw_glyph(name, source, glyf, advance, cap_height):
    # Resolve composites before reshaping so accents follow each letter's slant.
    coordinates, contours, flags = source.getCoordinates(glyf)
    variation = blake2s(name.encode(), digest_size=2).digest()
    lean = 0.13 + (variation[0] / 255 - 0.5) * 0.045
    rise = 0.095 + (variation[1] / 255 - 0.5) * 0.05
    center_x = advance / 2
    center_y = cap_height * 0.42
    glyph = Glyph()
    glyph.numberOfContours = len(contours)
    glyph.endPtsOfContours = contours
    # Resolved components can each carry an overlap flag. A simple glyph may only
    # carry it on the first point.
    glyph.flags = array("B", (flag & flagOnCurve for flag in flags))
    if any(flag & flagOverlapSimple for flag in flags):
        glyph.flags[0] |= flagOverlapSimple
    glyph.program = Program()
    glyph.program.fromBytecode([])
    glyph.coordinates = GlyphCoordinates(
        (otRound(x + lean * (y - center_y)), otRound(y + rise * (x - center_x)))
        for x, y in coordinates
    )
    return glyph


def build(weight):
    with TTFont(FONT_DIR / f"OswaldSoft-{weight}.ttf", recalcTimestamp=False) as font:
        glyf = font["glyf"]
        metrics = font["hmtx"].metrics
        cap_height = font["OS/2"].sCapHeight
        glyphs = {name: draw_glyph(name, glyf[name], glyf, metrics[name][0], cap_height)
                  for name in font.getGlyphOrder() if glyf[name].numberOfContours}
        for name, glyph in glyphs.items():
            glyf[name] = glyph
            glyph.recalcBounds(glyf)
            metrics[name] = (metrics[name][0], glyph.xMin)

        names = {
            1: FAMILY, 2: weight, 3: f"{FAMILY};{weight};1.0",
            4: f"{FAMILY} {weight}", 5: "Version 1.000", 6: f"MVPMarker-{weight}",
            10: "Display typeface derived from Oswald Soft under the SIL Open Font License.",
            16: FAMILY, 17: weight,
        }
        name_table = font["name"]
        name_table.removeNames(nameID=25)
        for name_id, value in names.items():
            name_table.removeNames(nameID=name_id)
            name_table.setName(value, name_id, 3, 1, 0x409)
            name_table.setName(value, name_id, 1, 0, 0)
        font["post"].italicAngle = -7.4
        font.save(FONT_DIR / f"MVPMarker-{weight}.ttf")


if __name__ == "__main__":
    for weight in ("Bold", "SemiBold"):
        build(weight)
