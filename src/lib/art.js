// Loads cover art that another app chose, without ever letting St open that file.
// St reads background images synchronously in the compositor, so a FIFO, /dev/zero or a huge image
// would freeze the session. Instead the cover is read here in capped chunks, its header size is checked
// before any pixels are decoded, and a small PNG copy in a private cache is what St loads.
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { fitSize, isAllowedImageFormat, isSafeImageSize } from './geometry.js';
import { isLocalArt } from './track.js';

const MAX_ART_BYTES = 4 * 1024 * 1024;
const CHUNK_BYTES = 64 * 1024;
// Cached cover size: sharp for the 48 px card cover with room to spare.
const COVER_SIZE = 96;
const CACHE_KEEP = 40;
const CACHE_DIR = GLib.build_filenamev([GLib.get_user_cache_dir(), 'island-xdashio']);
const QUERY = 'standard::type,standard::size,time::modified,time::modified-usec';

const isCancelled = error => error?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);

// Closing an unfinished loader or a failed stream throws; there is nothing left to release then
const closeQuietly = close => {
    try {
        close();
    } catch {
        // Already closed or failed
    }
};

// Feeds the stream to a pixbuf loader. A header that is too big gets a 0x0 target size, which makes
// gdk-pixbuf stop before it allocates anything; the byte cap stops endless streams.
function decodeStream(stream, cancellable, done) {
    const loader = new GdkPixbuf.PixbufLoader();
    let total = 0;
    let rejected = false;
    loader.connect('size-prepared', (_loader, width, height) => {
        const format = loader.get_format()?.get_name();
        rejected = !isAllowedImageFormat(format) || !isSafeImageSize(width, height);
        const [w, h] = rejected ? [0, 0] : fitSize(width, height, COVER_SIZE);
        loader.set_size(w, h);
    });
    const finish = pixbuf => {
        closeQuietly(() => stream.close(null));
        done(pixbuf);
    };
    const fail = () => {
        closeQuietly(() => loader.close());
        finish(null);
    };
    const readNext = () => stream.read_bytes_async(CHUNK_BYTES, GLib.PRIORITY_LOW, cancellable, (_s, res) => {
        let bytes;
        try {
            bytes = stream.read_bytes_finish(res);
        } catch (error) {
            if (isCancelled(error)) {
                closeQuietly(() => loader.close());
                closeQuietly(() => stream.close(null));
            } else {
                fail();
            }
            return;
        }
        if (bytes.get_size() === 0) {
            try {
                loader.close();
                finish(loader.get_pixbuf());
            } catch {
                finish(null);
            }
            return;
        }
        total += bytes.get_size();
        try {
            if (total > MAX_ART_BYTES)
                throw new Error('cover too large');
            loader.write_bytes(bytes);
            if (rejected)
                throw new Error('cover dimensions too large');
        } catch {
            fail();
            return;
        }
        readNext();
    });
    readNext();
}

function cachedUri(name) {
    const file = Gio.File.new_for_path(GLib.build_filenamev([CACHE_DIR, `${name}.png`]));
    return file.query_exists(null) ? file.get_uri() : null;
}

// Written under a temporary name and moved, so a half-written cover is never used
function saveCover(pixbuf, name) {
    const path = GLib.build_filenamev([CACHE_DIR, `${name}.png`]);
    try {
        GLib.mkdir_with_parents(CACHE_DIR, 0o700);
        pixbuf.savev(`${path}.tmp`, 'png', [], []);
        Gio.File.new_for_path(`${path}.tmp`).move(Gio.File.new_for_path(path), Gio.FileCopyFlags.OVERWRITE, null, null);
        return Gio.File.new_for_path(path).get_uri();
    } catch (error) {
        console.warn(`island: could not cache a cover: ${error.message}`);
        return null;
    }
}

// Keeps the newest covers, once the current one is on screen
function pruneCache() {
    GLib.idle_add(GLib.PRIORITY_LOW, () => {
        try {
            const dir = Gio.File.new_for_path(CACHE_DIR);
            const enumerator = dir.enumerate_children('standard::name,time::modified', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
            const infos = [];
            for (let info = enumerator.next_file(null); info; info = enumerator.next_file(null))
                infos.push(info);
            enumerator.close(null);
            infos
                .sort((a, b) => b.get_attribute_uint64('time::modified') - a.get_attribute_uint64('time::modified'))
                .slice(CACHE_KEEP)
                .forEach(info => dir.get_child(info.get_name()).delete(null));
        } catch (error) {
            console.warn(`island: could not prune the cover cache: ${error.message}`);
        }
        return GLib.SOURCE_REMOVE;
    });
}

/**
 * Calls done(uri) with a small cached copy of the cover that St can load safely, or done(null).
 * Never calls done once cancellable is cancelled.
 */
export function loadArt(url, cancellable, done) {
    const deliver = uri => {
        if (!cancellable.is_cancelled())
            done(uri);
    };
    if (!isLocalArt(url)) {
        deliver(null);
        return;
    }
    // Symlinks are not followed, so a link to /dev/zero or a FIFO is refused here
    const file = Gio.File.new_for_uri(url);
    file.query_info_async(QUERY, Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_LOW, cancellable, (_f, res) => {
        let info;
        try {
            info = file.query_info_finish(res);
        } catch (error) {
            if (!isCancelled(error))
                deliver(null);
            return;
        }
        const size = info.get_size();
        if (info.get_file_type() !== Gio.FileType.REGULAR || size <= 0 || size > MAX_ART_BYTES) {
            deliver(null);
            return;
        }
        // Players such as Chromium rewrite the same file for each track, so the key includes its age
        const modified = `${info.get_attribute_uint64('time::modified')}.${info.get_attribute_uint32('time::modified-usec')}`;
        const name = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, `${url}\n${size}\n${modified}`, -1);
        const cached = cachedUri(name);
        if (cached) {
            deliver(cached);
            return;
        }
        file.read_async(GLib.PRIORITY_LOW, cancellable, (_f2, res2) => {
            let stream;
            try {
                stream = file.read_finish(res2);
            } catch (error) {
                if (!isCancelled(error))
                    deliver(null);
                return;
            }
            decodeStream(stream, cancellable, pixbuf => {
                if (!pixbuf || cancellable.is_cancelled()) {
                    deliver(null);
                    return;
                }
                deliver(saveCover(pixbuf, name));
                pruneCache();
            });
        });
    });
}
