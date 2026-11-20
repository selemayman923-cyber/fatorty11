import ctypes as C
from ctypes.util import find_library
from pathlib import Path
import sys

import fitz

library = find_library('zbar')
if not library:
    raise RuntimeError('libzbar is required to decode the printed output')
zbar = C.CDLL(library)
pointer = C.c_void_p
u32 = C.c_uint
binding = {
    'zbar_image_scanner_create': (pointer, []),
    'zbar_image_scanner_destroy': (None, [pointer]),
    'zbar_image_scanner_set_config': (C.c_int, [pointer, C.c_int, C.c_int, C.c_int]),
    'zbar_image_create': (pointer, []),
    'zbar_image_destroy': (None, [pointer]),
    'zbar_image_set_format': (None, [pointer, C.c_ulong]),
    'zbar_image_set_size': (None, [pointer, u32, u32]),
    'zbar_image_set_data': (None, [pointer, pointer, C.c_ulong, pointer]),
    'zbar_scan_image': (C.c_int, [pointer, pointer]),
    'zbar_image_first_symbol': (pointer, [pointer]),
    'zbar_symbol_get_data': (C.c_char_p, [pointer]),
}
for name, (result_type, types) in binding.items():
    fn = getattr(zbar, name)
    fn.restype = result_type
    fn.argtypes = types


def decode(page):
    raster = page.get_pixmap(dpi=300, colorspace=fitz.csGRAY, alpha=False)
    raw = C.create_string_buffer(raster.samples)
    scanner = zbar.zbar_image_scanner_create()
    image = zbar.zbar_image_create()
    try:
        zbar.zbar_image_scanner_set_config(scanner, 0, 0, 0)
        zbar.zbar_image_scanner_set_config(scanner, 64, 0, 1)  # ZBAR_QRCODE
        zbar.zbar_image_set_format(image, int.from_bytes(b'Y800','little'))
        zbar.zbar_image_set_size(image, raster.width, raster.height)
        zbar.zbar_image_set_data(image, raw, len(raster.samples), None)
        count = zbar.zbar_scan_image(scanner, image)
        return None if count < 1 else zbar.zbar_symbol_get_data(
            zbar.zbar_image_first_symbol(image)).decode('utf-8')
    finally:
        zbar.zbar_image_destroy(image)
        zbar.zbar_image_scanner_destroy(scanner)


root = Path(sys.argv[1])
with fitz.open(root / 'SNS_Long_A4_Test.pdf') as a4, fitz.open(root / 'SNS_Thermal_58mm_Test.pdf') as thermal:
    assert len(a4) == 2 and abs(a4[-1].rect.width - 595) < 1 and abs(a4[-1].rect.height - 842) < 1
    text = a4[-1].get_text()
    assert '25 صنف' in text and '520.00' in text
    payload = decode(a4[-1])
    assert payload and 'INV#1' in payload and '520' in payload, payload
    print('PASS A4, two pages, last item, total 520 EGP and QR decoded from exported PDF:', payload)
    assert len(thermal) == 1 and abs(thermal[0].rect.width * 25.4 / 72 - 58) < 0.3
    assert '150.00' in thermal[0].get_text()
    payload = decode(thermal[0])
    assert payload, 'No QR decoded from thermal PDF'
    print('PASS thermal 58 mm, total 150 EGP and QR decoded from exported PDF:', payload)
