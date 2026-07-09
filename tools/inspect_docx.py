import collections
import pathlib
import re
import sys
import zipfile


docx_path = pathlib.Path(sys.argv[1])
output_dir = pathlib.Path(sys.argv[2])
output_dir.mkdir(parents=True, exist_ok=True)

with zipfile.ZipFile(docx_path) as archive:
    names = archive.namelist()
    media = [name for name in names if name.startswith("word/media/")]
    print("media", len(media))
    for name in media:
        target = output_dir / pathlib.Path(name).name
        target.write_bytes(archive.read(name))
        print(target)

    xml = archive.read("word/document.xml").decode("utf-8", errors="ignore")
    styles = archive.read("word/styles.xml").decode("utf-8", errors="ignore")

print("fills", collections.Counter(re.findall(r'w:fill="([0-9A-Fa-f]+)"', xml)).most_common(20))
print("text_colors", collections.Counter(re.findall(r'w:color w:val="([0-9A-Fa-f]+)"', xml)).most_common(20))
print("font_sizes", collections.Counter(re.findall(r'w:sz w:val="([0-9]+)"', xml)).most_common(20))
print("tables", xml.count("<w:tbl>"))
print("style_fills", collections.Counter(re.findall(r'w:fill="([0-9A-Fa-f]+)"', styles)).most_common(20))
