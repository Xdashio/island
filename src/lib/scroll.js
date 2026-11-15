// Turns scrolling on the cover into one track skip per gesture. Pure: runs under node --test.
// A mouse wheel sends one event per notch; a touchpad sends many small smooth deltas, then momentum.

// Smooth delta that counts as one wheel notch (GNOME's own slider uses the same scale)
export const SMOOTH_THRESHOLD = 1;
// After a skip, further scrolling is ignored at least this long, so a fast wheel spin skips only once
export const COOLDOWN_MS = 400;
// A pause this long between smooth events ends a touchpad gesture; until then a gesture that already
// skipped stays spent, however long it goes on
export const IDLE_RESET_MS = 300;
// What scrolling on the cover does in a single video that cannot skip tracks
export const SEEK_STEP_US = 10_000_000;

const FORWARD = new Set(['down', 'right']);
const BACKWARD = new Set(['up', 'left']);

export function initialScrollState() {
    return { acc: 0, lastEventAt: -Infinity, lastActionAt: -Infinity, spent: false };
}

// Event times are 32-bit milliseconds and wrap after 49 days; a time that went backwards counts as long ago
const elapsed = (now, then) => {
    const diff = now - then;
    return diff >= 0 ? diff : Infinity;
};

function deltaOf(event) {
    if (event.kind === 'discrete') {
        if (FORWARD.has(event.direction))
            return SMOOTH_THRESHOLD;
        return BACKWARD.has(event.direction) ? -SMOOTH_THRESHOLD : 0;
    }
    const { dx = 0, dy = 0 } = event;
    return Math.abs(dx) > Math.abs(dy) ? dx : dy;
}

/**
 * One scroll event in, maybe an action out: 'next', 'previous' or null, with the new state.
 * finished marks the smooth event sent when the fingers lift, where the system reports it.
 * @param {{acc: number, lastEventAt: number, lastActionAt: number, spent: boolean}} state
 * @param {{kind: 'discrete'|'smooth', direction?: string, dx?: number, dy?: number, time: number, finished?: boolean}} event
 * @returns {[('next'|'previous'|null), object]}
 */
export function scrollAction(state, event) {
    const { time } = event;
    const smooth = event.kind === 'smooth';
    const fresh = elapsed(time, state.lastEventAt) > IDLE_RESET_MS;

    // The rest of a touchpad gesture that already skipped: nothing, until the fingers lift or rest
    if (smooth && state.spent && !fresh)
        return [null, { ...state, acc: 0, lastEventAt: time, spent: !event.finished }];

    if (elapsed(time, state.lastActionAt) < COOLDOWN_MS)
        return [null, { ...state, acc: 0, lastEventAt: time, spent: smooth && !event.finished }];

    const acc = (fresh ? 0 : state.acc) + deltaOf(event);
    if (Math.abs(acc) < SMOOTH_THRESHOLD)
        return [null, { ...state, acc, lastEventAt: time, spent: false }];
    const spent = smooth && !event.finished;
    return [acc > 0 ? 'next' : 'previous', { acc: 0, lastEventAt: time, lastActionAt: time, spent }];
}

/**
 * What a skip on the cover does for this player: the track, or a ten second jump when it cannot skip.
 * @param {'next'|'previous'|null} action
 * @param {{canGoNext: boolean, canGoPrevious: boolean, canSeek: boolean}|null} state
 * @returns {{type: 'next'|'previous'}|{type: 'seek', offsetUs: number}|null}
 */
export function coverAction(action, state) {
    if (!action || !state)
        return null;
    const forward = action === 'next';
    if (forward ? state.canGoNext : state.canGoPrevious)
        return { type: action };
    if (state.canSeek)
        return { type: 'seek', offsetUs: forward ? SEEK_STEP_US : -SEEK_STEP_US };
    return null;
}
