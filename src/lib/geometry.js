// Placement, meter and cover image checks. Pure: runs under node --test.

// Gap between the bottom of the top bar and the media card.
export const CARD_GAP = 6;
// Closest the card may come to a monitor edge.
export const EDGE_MARGIN = 8;
// Height of a meter bar while paused, as a fraction of full height.
export const MIN_LEVEL = 0.25;
// Largest cover side decoded: 2048 x 2048 RGBA is 16 MiB at most.
export const MAX_IMAGE_SIDE = 2048;

// Raster formats players use for covers; exotic gdk-pixbuf loaders (WMF, HEIF, ICNS, SVG) are never fed
const ALLOWED_IMAGE_FORMATS = new Set(['png', 'jpeg', 'gif', 'webp', 'bmp']);

/**
 * Whether a gdk-pixbuf format name is one the island will decode.
 * @param {unknown} name
 * @returns {boolean}
 */
export function isAllowedImageFormat(name) {
    return ALLOWED_IMAGE_FORMATS.has(name);
}

/**
 * Whether an image header describes a size that is safe to decode.
 * @param {number} width
 * @param {number} height
 * @returns {boolean}
 */
export function isSafeImageSize(width, height) {
    return width > 0 && height > 0 && width <= MAX_IMAGE_SIDE && height <= MAX_IMAGE_SIDE;
}

/**
 * Fits width x height inside a size x size square, keeping the shape and never scaling up.
 * @returns {[number, number]}
 */
export function fitSize(width, height, size) {
    const scale = Math.min(1, size / Math.max(width, height));
    return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

/**
 * Centres the card under the pill and keeps it on the monitor, in whole pixels.
 * @returns {{x: number, y: number}}
 */
export function cardPosition({ anchorX, anchorWidth, top, cardWidth, monitorX, monitorWidth }) {
    const centred = anchorX + (anchorWidth - cardWidth) / 2;
    const min = monitorX + EDGE_MARGIN;
    const max = monitorX + monitorWidth - cardWidth - EDGE_MARGIN;
    return { x: Math.round(Math.min(Math.max(centred, min), max)), y: Math.round(top + CARD_GAP) };
}

/**
 * New heights for the meter bars: random while playing, flat while paused.
 * @param {() => number} random returns [0, 1)
 * @param {boolean} playing
 * @param {number} count
 * @returns {number[]}
 */
export function nextLevels(random, playing, count) {
    return Array.from({ length: count }, () => playing ? MIN_LEVEL + random() * (1 - MIN_LEVEL) : MIN_LEVEL);
}
