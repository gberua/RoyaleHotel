"""
Builds the self-hosted fallback fonts in src/fonts/ (run once; outputs are committed).

  pip3 install fonttools brotli
  python3 scripts/build-fonts.py <dir with the Google Fonts variable TTFs>

Sources (SIL Open Font License 1.1, modification permitted):
  github.com/google/fonts/tree/main/ofl/{notoserifgeorgian,notoserifdisplay,notosansgeorgian,notosans}

Why: the variable fonts are ~350 KB per page. Pinning the axes (width 72 % for the condensed
display look, fixed weights) and subsetting to the scripts we use gives small static WOFF2 files.
"""
import sys, os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "fonts")
os.makedirs(OUT, exist_ok=True)

GEORGIAN = "U+10A0-10FF,U+1C90-1CBF,U+2D00-2D2F,U+0020,U+00A0,U+20BE"
LATIN_CYR = ("U+0000-00FF,U+0100-017F,U+0218-021B,U+0300-0301,U+0400-045F,U+0490-0491,U+04B0-04B1,"
             "U+2010-2027,U+2030-203A,U+20AC,U+20B4,U+20BD,U+20BE,U+2116,U+2122,U+2190-2193,U+2212")

JOBS = [
    ("NotoSerifGeorgian.ttf", "display-ka-400", {"wdth": 72, "wght": 400}, GEORGIAN),
    ("NotoSerifDisplay.ttf", "display-latin-400", {"wdth": 72, "wght": 400}, LATIN_CYR),
    ("NotoSansGeorgian.ttf", "body-ka-400", {"wdth": 100, "wght": 400}, GEORGIAN),
    ("NotoSansGeorgian.ttf", "body-ka-500", {"wdth": 100, "wght": 500}, GEORGIAN),
    ("NotoSansGeorgian.ttf", "body-ka-600", {"wdth": 100, "wght": 600}, GEORGIAN),
    ("NotoSans.ttf", "body-latin-400", {"wdth": 100, "wght": 400}, LATIN_CYR),
    ("NotoSans.ttf", "body-latin-500", {"wdth": 100, "wght": 500}, LATIN_CYR),
    ("NotoSans.ttf", "body-latin-600", {"wdth": 100, "wght": 600}, LATIN_CYR),
]

def parse(ranges):
    out = []
    for r in ranges.split(","):
        r = r.strip().replace("U+", "")
        if "-" in r:
            a, b = r.split("-"); out.extend(range(int(a, 16), int(b, 16) + 1))
        else:
            out.append(int(r, 16))
    return out

for src, name, axes, ranges in JOBS:
    font = TTFont(os.path.join(SRC, src))
    font = instancer.instantiateVariableFont(font, axes, updateFontNames=False)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk", "tnum", "lnum"]
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6]
    opts.hinting = False
    opts.desubroutinize = True
    sub = subset.Subsetter(options=opts)
    sub.populate(unicodes=parse(ranges))
    sub.subset(font)
    path = os.path.join(OUT, name + ".woff2")
    font.flavor = "woff2"
    font.save(path)
    print(f"{name:20s} {os.path.getsize(path)/1024:6.1f} KB")
