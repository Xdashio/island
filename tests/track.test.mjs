import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { trackInfo, isLocalArt, mediaState } from '../src/lib/track.js';

describe('trackInfo', () => {
    test('uses the title and joins the artists', () => {
        const info = trackInfo({ rawTitle: '  Song  ', artists: ['A', 'B'] });
        assert.deepEqual(info, { title: 'Song', subtitle: 'A, B' });
    });

    test('skips empty and non-string artists', () => {
        const info = trackInfo({ rawTitle: 'Song', artists: ['', 'A', 3, null] });
        assert.equal(info.subtitle, 'A');
    });

    test('a single artist string is accepted', () => {
        assert.equal(trackInfo({ rawTitle: 'Song', artists: 'Solo' }).subtitle, 'Solo');
    });

    test('falls back when the title is missing', () => {
        assert.deepEqual(trackInfo({}), { title: 'Unknown title', subtitle: '' });
    });
});

describe('isLocalArt', () => {
    test('accepts local file covers', () => {
        assert.equal(isLocalArt('file:///tmp/.org.chromium.Chromium.GQ2njf'), true);
    });

    test('never fetches web covers', () => {
        assert.equal(isLocalArt('https://i.scdn.co/image/abc'), false);
        assert.equal(isLocalArt('http://127.0.0.1:8080/a.jpg'), false);
    });

    test('rejects anything else', () => {
        assert.equal(isLocalArt(''), false);
        assert.equal(isLocalArt(undefined), false);
        assert.equal(isLocalArt('data:image/png;base64,AAAA'), false);
        assert.equal(isLocalArt('/tmp/cover.png'), false);
        assert.equal(isLocalArt('file://host/share/a.png'), false);
        assert.equal(isLocalArt(42), false);
    });
});

describe('mediaState', () => {
    const snapshot = {
        id: 'org.mpris.MediaPlayer2.brave.instance1',
        busName: 'org.mpris.MediaPlayer2.brave.instance1',
        status: 'Playing',
        rawTitle: 'Episode 8',
        artists: ['The Mentalist'],
        artUrl: 'file:///tmp/art',
        canGoNext: true,
        canGoPrevious: false,
        canPlay: true,
        canPause: true,
        canSeek: true,
        length: 2531654144,
        trackId: '/com/brave/MediaPlayer2/TrackList/Track49',
    };

    test('builds what the island shows', () => {
        assert.deepEqual(mediaState(snapshot, 'Brave'), {
            id: snapshot.id,
            title: 'Episode 8',
            subtitle: 'The Mentalist',
            appName: 'Brave',
            artUrl: 'file:///tmp/art',
            playing: true,
            canGoNext: true,
            canGoPrevious: false,
            canPlayPause: true,
            length: 2531654144,
            canSeek: true,
            trackId: '/com/brave/MediaPlayer2/TrackList/Track49',
        });
    });

    test('a stream without a length shows no progress and cannot seek', () => {
        const state = mediaState({ ...snapshot, length: undefined, trackId: '/org/mpris/MediaPlayer2/TrackList/NoTrack' }, '');
        assert.equal(state.length, 0);
        assert.equal(state.canSeek, false);
        assert.equal(state.trackId, null);
    });

    test('a player that cannot seek still shows its length', () => {
        const state = mediaState({ ...snapshot, canSeek: false }, '');
        assert.equal(state.length, 2531654144);
        assert.equal(state.canSeek, false);
    });

    test('drops a cover it will not load, so the app icon shows', () => {
        assert.equal(mediaState({ ...snapshot, artUrl: 'https://i.scdn.co/image/abc' }, 'Spotify').artUrl, '');
    });

    test('is null when the player should not show', () => {
        assert.equal(mediaState({ ...snapshot, status: 'Stopped' }, 'Brave'), null);
        assert.equal(mediaState(null, 'Brave'), null);
    });

    test('paused players are not playing and missing flags are false', () => {
        const state = mediaState({ ...snapshot, status: 'Paused', canGoNext: undefined, canPlay: false, canPause: false }, '');
        assert.equal(state.playing, false);
        assert.equal(state.canGoNext, false);
        assert.equal(state.canPlayPause, false);
        assert.equal(state.appName, '');
    });
});
