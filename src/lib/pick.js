// Which media player the island shows. Pure: no GNOME imports, so it runs under node --test.
// A snapshot is {id, busName, status, rawTitle}, where rawTitle is xesam:title as sent (undefined when absent).

// The old Dynamic Island extension ran a fake "idle" player; never show it.
export const IGNORED_PLAYERS = new Set(['org.mpris.MediaPlayer2.DynamicIsland']);

const RANK = Object.freeze({ NONE: 0, NO_TITLE: 1, PAUSED: 2, PLAYING: 3 });

/**
 * Higher is better: playing with a title, paused with a title, anything else still alive.
 * An empty title is skipped so silent apps (Electron notification sounds) never take the island.
 * @param {{busName?: string, status?: string|null, rawTitle?: unknown}|null} snapshot
 * @returns {number}
 */
export function rankPlayer(snapshot) {
    if (!snapshot || IGNORED_PLAYERS.has(snapshot.busName))
        return RANK.NONE;
    const { status, rawTitle } = snapshot;
    if (!status || status === 'Stopped' || rawTitle === '')
        return RANK.NONE;
    if (rawTitle === undefined || rawTitle === null)
        return RANK.NO_TITLE;
    return status === 'Playing' ? RANK.PLAYING : RANK.PAUSED;
}

/**
 * The id of the player to show, or null. On a tie the player that just changed wins if it is playing,
 * then the current one, so the last player to start playing takes over and paused ones never steal it.
 * @param {Array<{id: string}>} snapshots
 * @param {string|null} currentId
 * @param {string|null} changedId
 * @returns {string|null}
 */
export function pickPlayer(snapshots, currentId, changedId) {
    const byId = new Map(snapshots.map(s => [s.id, s]));
    const changed = byId.get(changedId);
    const ordered = [
        changed?.status === 'Playing' ? changed : null,
        byId.get(currentId),
        ...snapshots,
    ].filter(Boolean);

    let best = null;
    let bestRank = RANK.NONE;
    for (const snapshot of ordered) {
        const rank = rankPlayer(snapshot);
        if (rank > bestRank) {
            best = snapshot;
            bestRank = rank;
        }
    }
    return best?.id ?? null;
}
