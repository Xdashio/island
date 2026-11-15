import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { formatTime, progressInfo, seekPosition, usableTrackId, END_GUARD_US } from '../src/lib/progress.js';

const SECOND = 1_000_000;

describe('formatTime', () => {
    test('shows minutes and seconds', () => {
        assert.equal(formatTime(0), '0:00');
        assert.equal(formatTime(61.9 * SECOND), '1:01');
        assert.equal(formatTime(59 * 60 * SECOND), '59:00');
    });

    test('adds hours for long media', () => {
        assert.equal(formatTime((3600 + 2 * 60 + 5) * SECOND), '1:02:05');
    });

    test('treats bad values as zero', () => {
        assert.equal(formatTime(-5), '0:00');
        assert.equal(formatTime(Number.NaN), '0:00');
        assert.equal(formatTime(undefined), '0:00');
    });
});

describe('progressInfo', () => {
    test('gives the bar position and both times', () => {
        assert.deepEqual(progressInfo(30 * SECOND, 120 * SECOND), {
            fraction: 0.25,
            elapsed: '0:30',
            remaining: '−1:30',
        });
    });

    test('clamps a position past either end', () => {
        assert.equal(progressInfo(500 * SECOND, 120 * SECOND).fraction, 1);
        assert.equal(progressInfo(-1, 120 * SECOND).fraction, 0);
        assert.equal(progressInfo(500 * SECOND, 120 * SECOND).remaining, '−0:00');
    });

    test('is null for live streams and unknown lengths', () => {
        assert.equal(progressInfo(10, 0), null);
        assert.equal(progressInfo(10, undefined), null);
        assert.equal(progressInfo(10, -3), null);
    });
});

describe('seekPosition', () => {
    test('turns a bar position into microseconds', () => {
        assert.equal(seekPosition(0.25, 120 * SECOND), 30 * SECOND);
    });

    test('stops just short of the end so the track does not skip', () => {
        assert.equal(seekPosition(1, 120 * SECOND), 120 * SECOND - END_GUARD_US);
        assert.equal(seekPosition(2, 120 * SECOND), 120 * SECOND - END_GUARD_US);
    });

    test('never goes below zero', () => {
        assert.equal(seekPosition(-1, 120 * SECOND), 0);
        assert.equal(seekPosition(0.5, END_GUARD_US / 2), 0);
    });
});

describe('usableTrackId', () => {
    test('keeps a real track id', () => {
        assert.equal(usableTrackId('/com/brave/MediaPlayer2/TrackList/Track49'), '/com/brave/MediaPlayer2/TrackList/Track49');
    });

    test('drops the no-track id and anything that is not an object path', () => {
        assert.equal(usableTrackId('/org/mpris/MediaPlayer2/TrackList/NoTrack'), null);
        assert.equal(usableTrackId('track-1'), null);
        assert.equal(usableTrackId(''), null);
        assert.equal(usableTrackId(undefined), null);
    });
});
