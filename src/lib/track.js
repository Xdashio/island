// Turns a raw MPRIS snapshot into what the island shows. Pure: runs under node --test.
import { rankPlayer } from './pick.js';
import { usableTrackId } from './progress.js';

const UNKNOWN_TITLE = 'Unknown title';

const asArtistList = artists => {
    const list = Array.isArray(artists) ? artists : [artists];
    return list.filter(a => typeof a === 'string' && a.trim() !== '').map(a => a.trim());
};

/**
 * @param {{rawTitle?: unknown, artists?: unknown}} snapshot
 * @returns {{title: string, subtitle: string}}
 */
export function trackInfo({ rawTitle, artists } = {}) {
    const title = typeof rawTitle === 'string' && rawTitle.trim() !== '' ? rawTitle.trim() : UNKNOWN_TITLE;
    return { title, subtitle: asArtistList(artists).join(', ') };
}

/**
 * Whether a cover URL is a local file the island may load. Web covers are never fetched, so the
 * shell makes no network requests chosen by other apps; those players show their app icon instead.
 * @param {unknown} url
 * @returns {boolean}
 */
export function isLocalArt(url) {
    return typeof url === 'string' && url.startsWith('file:///');
}

/**
 * What the island shows for a player, or null when it should stay hidden.
 * @param {object|null} snapshot
 * @param {string} appName
 */
export function mediaState(snapshot, appName) {
    if (rankPlayer(snapshot) === 0)
        return null;
    const { title, subtitle } = trackInfo(snapshot);
    const length = Number.isFinite(snapshot.length) && snapshot.length > 0 ? Math.round(snapshot.length) : 0;
    return {
        id: snapshot.id,
        title,
        subtitle,
        appName: appName ?? '',
        artUrl: isLocalArt(snapshot.artUrl) ? snapshot.artUrl : '',
        playing: snapshot.status === 'Playing',
        canGoNext: snapshot.canGoNext === true,
        canGoPrevious: snapshot.canGoPrevious === true,
        canPlayPause: snapshot.canPlay === true || snapshot.canPause === true,
        // Microseconds; 0 for live streams, which get no progress bar
        length,
        canSeek: snapshot.canSeek === true && length > 0,
        trackId: usableTrackId(snapshot.trackId),
    };
}
