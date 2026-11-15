// Cover loading under real gjs and gdk-pixbuf, against a normal cover and hostile inputs.
// Run with scripts/smoke.sh, which points XDG_CACHE_HOME at a throwaway folder.
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

import { loadArt } from '../../src/lib/art.js';

const TIMEOUT_MS = 10000;
const dir = GLib.dir_make_tmp('island-smoke-XXXXXX');
const path = name => GLib.build_filenamev([dir, name]);
const uri = name => Gio.File.new_for_path(path(name)).get_uri();

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++)
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
const crc32 = bytes => (bytes.reduce((c, b) => CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8), 0xffffffff) ^ 0xffffffff) >>> 0;
const u32 = n => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const chunk = (type, data) => {
    const body = [...new TextEncoder().encode(type), ...data];
    return [...u32(data.length), ...body, ...u32(crc32(body))];
};

// A valid PNG header that claims 30000 x 30000 pixels: 3.6 GB if anything decoded it
function writeBomb(name) {
    const ihdr = [...u32(30000), ...u32(30000), 8, 6, 0, 0, 0];
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk('IHDR', ihdr), ...chunk('IEND', [])];
    GLib.file_set_contents(path(name), new Uint8Array(png));
}

function setUp() {
    const cover = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, false, 8, 300, 200);
    cover.fill(0x7aa2f7ff);
    cover.savev(path('cover.png'), 'png', [], []);
    // ICO holds at most 256 px
    cover.scale_simple(64, 64, GdkPixbuf.InterpType.BILINEAR).savev(path('cover.ico'), 'ico', [], []);
    writeBomb('bomb.png');
    GLib.file_set_contents(path('notimage.png'), '<html>not a cover</html>');
    Gio.File.new_for_path(path('zero.png')).make_symbolic_link('/dev/zero', null);
    GLib.spawn_sync(null, ['mkfifo', path('fifo.png')], null, GLib.SpawnFlags.SEARCH_PATH, null);
}

const CASES = [
    ['a normal cover is cached as a small PNG', uri('cover.png'), 'small'],
    ['a header claiming 30000 x 30000 is refused', uri('bomb.png'), null],
    ['a symlink to /dev/zero is refused', uri('zero.png'), null],
    ['a FIFO is refused', uri('fifo.png'), null],
    ['a file that is not an image is refused', uri('notimage.png'), null],
    ['an exotic format (ICO) is refused', uri('cover.ico'), null],
    ['a missing file is refused', uri('missing.png'), null],
    ['a web cover is never fetched', 'https://example.com/cover.png', null],
];

function check(expected, result) {
    if (expected === null)
        return result === null;
    if (!result)
        return false;
    const pixbuf = GdkPixbuf.Pixbuf.new_from_file(Gio.File.new_for_uri(result).get_path());
    return pixbuf.get_width() <= 96 && pixbuf.get_height() <= 96;
}

setUp();
const loop = new GLib.MainLoop(null, false);
let failures = 0;
let pending = CASES.length;
for (const [name, url, expected] of CASES) {
    loadArt(url, new Gio.Cancellable(), result => {
        const ok = check(expected, result);
        failures += ok ? 0 : 1;
        print(`${ok ? 'ok' : 'FAIL'}: ${name}`);
        if (--pending === 0)
            loop.quit();
    });
}

let cancelledCalled = false;
const cancellable = new Gio.Cancellable();
loadArt(uri('cover.png'), cancellable, () => {
    cancelledCalled = true;
});
cancellable.cancel();

const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TIMEOUT_MS, () => {
    print(`FAIL: ${pending} case(s) never finished`);
    failures += 1;
    loop.quit();
    return GLib.SOURCE_REMOVE;
});
loop.run();
if (pending === 0)
    GLib.source_remove(timeoutId);

// Let any late callback for the cancelled load arrive before judging it
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
    loop.quit();
    return GLib.SOURCE_REMOVE;
});
loop.run();
print(`${cancelledCalled ? 'FAIL' : 'ok'}: a cancelled load never calls back`);
failures += cancelledCalled ? 1 : 0;

GLib.spawn_sync(null, ['rm', '-rf', dir], null, GLib.SpawnFlags.SEARCH_PATH, null);
print(failures ? `${failures} smoke check(s) failed` : 'all smoke checks passed');
System.exit(failures ? 1 : 0);
