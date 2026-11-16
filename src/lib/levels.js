// Volume and brightness levels for the pill. Pure: runs under node --test.

// One wheel notch on the meter, as a share of 100 % volume (GNOME's own slider uses the same)
export const VOLUME_SCROLL_STEP = 0.02;
const VOLUME_ICONS = ['muted', 'low', 'medium', 'high'];

const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

/**
 * How full the level bar is, from 0 to 1, or null when GNOME sent no level.
 * @returns {number|null}
 */
export function levelFraction(level, maxLevel) {
    if (!Number.isFinite(level))
        return null;
    const max = Number.isFinite(maxLevel) && maxLevel > 0 ? maxLevel : 1;
    return clamp(level / max, 0, 1);
}

/** The level as a whole percent, which goes past 100 for boosted volume. */
export function levelPercent(level) {
    return String(Math.max(0, Math.round(level * 100)));
}

/**
 * Whether the pill shows a GNOME pop-up instead of GNOME: only pop-ups with a level (volume,
 * brightness), meant for every monitor or the main one, while the top bar is on screen.
 */
export function takesOsd({ enabled, monitorIndex, primaryIndex, level, fullscreen }) {
    return enabled && Number.isFinite(level) && !fullscreen &&
        (monitorIndex === -1 || monitorIndex === primaryIndex);
}

/**
 * The new output volume after one scroll event on the meter, the way GNOME's volume slider does it:
 * up for louder, never past 100 % by scrolling, muted at zero and unmuted above it. While muted the
 * slider reads zero, so down changes nothing (the saved volume stays) and up starts from silence.
 * @param {{volume: number, maxNorm: number, muted: boolean}} sink raw Gvc volume units
 * @param {{kind: 'discrete'|'smooth', direction?: string, dy?: number}} input
 * @returns {{volume: number, muted: boolean, changed: boolean}}
 */
export function scrollVolume({ volume, maxNorm, muted }, input) {
    const notches = input.kind === 'discrete'
        ? ({ up: 1, down: -1 }[input.direction] ?? 0)
        : -(input.dy ?? 0);
    if (notches === 0 || (muted && notches < 0))
        return { volume, muted, changed: false };
    const base = muted ? 0 : volume;
    const target = clamp(base + notches * VOLUME_SCROLL_STEP * maxNorm, 0, Math.max(maxNorm, base));
    const next = target < 1 ? { volume: 0, muted: true } : { volume: Math.round(target), muted: false };
    return { ...next, changed: next.volume !== Math.round(volume) || next.muted !== muted };
}

/** GNOME's volume icon for a raw volume. */
export function volumeIconName(volume, maxNorm, muted) {
    if (muted || volume <= 0)
        return 'audio-volume-muted-symbolic';
    const step = Math.max(1, Math.ceil(3 * volume / maxNorm));
    return `audio-volume-${step > 3 ? 'overamplified' : VOLUME_ICONS[step]}-symbolic`;
}
