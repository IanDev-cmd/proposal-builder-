# -*- mode: python ; coding: utf-8 -*-
"""Onedir freeze of the WEOTT PDF engine.

Output (with --distpath .): ./dist-engine/engine.exe
Assets stay beside the extracted code under _internal, which config.bundle_root()
reads as sys._MEIPASS.
"""

from PyInstaller.utils.hooks import collect_all

datas = []
binaries = []
hiddenimports = [
    "flask",
    "jinja2",
    "werkzeug",
    "click",
    "itsdangerous",
    "markupsafe",
    "blinker",
    "pydantic",
    "pydantic_core",
    "fitz",
    "pymupdf",
    "workspace_sqlite",
    "workspace_store",
    "workspace_pg",
    "catalog",
    "config",
    "engine",
    "fonts",
    "inserts",
    "measure",
    "pdf_ops",
    "team_auth",
    "payload_schema",
]

for package in ("fitz", "pymupdf"):
    collected_datas, collected_binaries, collected_hidden = collect_all(package)
    datas += collected_datas
    binaries += collected_binaries
    hiddenimports += collected_hidden

datas += [
    ("assets/fonts", "assets/fonts"),
    ("assets/templates", "assets/templates"),
    ("assets/inserts", "assets/inserts"),
    ("assets/vessels", "assets/vessels"),
    ("template.pdf", "."),
]

a = Analysis(
    ["app.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["psycopg", "psycopg_pool", "psycopg_binary", "gunicorn", "pytest"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="engine",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="dist-engine",
)
