// Track position maths for the card's progress bar. Pure: runs under node --test.
// MPRIS positions and lengths are in microseconds.

const SECOND_US = 1_000_000;
// Seeking right to the end makes most players jump to the next track, so the bar stops this short of it
export const END_GUARD_US = 500_000;
const NO_TRACK = '/org/mpris/MediaPlayer2/TrackList/NoTrack';
// A typographic minus lines up with the digits better than a hyphen
const MINUS = '−';

const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
const two = n => String(n).padStart(2, '0');

/**
 * m:ss, or h:mm:ss from an hour up.
 * @param {unknown} us
 * @returns {string}
 */
export function formatTime(us) {
    const total = Number.isFinite(us) && us > 0 ? Math.floor(us / SECOND_US) : 0;
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor(total / 60) % 60;
    const seconds = total % 60;
    return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}

/**
 * Where the bar sits and the two time labels, or null when the length is unknown (live streams).
 * @returns {{fraction: number, elapsed: string, remaining: string}|null}
 */
export function progressInfo(positionUs, lengthUs) {
    if (!Number.isFinite(lengthUs) || lengthUs <= 0)
        return null;
    const position = clamp(Number.isFinite(positionUs) ? positionUs : 0, 0, lengthUs);
    return {
        fraction: position / lengthUs,
        elapsed: formatTime(position),
        remaining: `${MINUS}${formatTime(lengthUs - position)}`,
    };
}

/**
 * The position to seek to for a bar position from 0 to 1.
 * @returns {number} microseconds
 */
export function seekPosition(fraction, lengthUs) {
    const max = Math.max(0, lengthUs - END_GUARD_US);
    return Math.min(Math.round(clamp(fraction, 0, 1) * lengthUs), max);
}

/**
 * The track id SetPosition needs, or null when the player sent none (then Seek is used instead).
 * @param {unknown} id
 * @returns {string|null}
 */
export function usableTrackId(id) {
    if (typeof id !== 'string' || id === NO_TRACK || !/^(\/[A-Za-z0-9_]+)+$/.test(id))
        return null;
    return id;
}
