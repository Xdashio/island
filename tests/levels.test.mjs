import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    levelFraction,
    levelPercent,
    takesOsd,
    scrollVolume,
    volumeIconName,
    VOLUME_SCROLL_STEP,
} from '../src/lib/levels.js';

const MAX = 65536;

describe('levelFraction', () => {
    test('is the level against its maximum', () => {
        assert.equal(levelFraction(0.5, 1), 0.5);
        assert.equal(levelFraction(0.75, 1.5), 0.5);
    });

    test('treats a missing maximum as 1 and clamps', () => {
        assert.equal(levelFraction(0.3, undefined), 0.3);
        assert.equal(levelFraction(2, 1), 1);
        assert.equal(levelFraction(-1, 1), 0);
    });

    test('is null when there is no level', () => {
        assert.equal(levelFraction(undefined, 1), null);
        assert.equal(levelFraction(Number.NaN, 1), null);
    });
});

describe('levelPercent', () => {
    test('rounds to a whole percent, past 100 for boosted volume', () => {
        assert.equal(levelPercent(0.456), '46');
        assert.equal(levelPercent(1.25), '125');
        assert.equal(levelPercent(-0.1), '0');
    });
});

describe('takesOsd', () => {
    const base = { enabled: true, monitorIndex: -1, primaryIndex: 0, level: 0.5, fullscreen: false };

    test('takes volume and brightness pop-ups meant for every monitor or the main one', () => {
        assert.equal(takesOsd(base), true);
        assert.equal(takesOsd({ ...base, monitorIndex: 0 }), true);
    });

    test('leaves pop-ups without a level to GNOME (caps lock, airplane mode)', () => {
        assert.equal(takesOsd({ ...base, level: undefined }), false);
        assert.equal(takesOsd({ ...base, level: null }), false);
    });

    test('leaves GNOME in charge when the bar is hidden, off, or another monitor is meant', () => {
        assert.equal(takesOsd({ ...base, fullscreen: true }), false);
        assert.equal(takesOsd({ ...base, enabled: false }), false);
        assert.equal(takesOsd({ ...base, monitorIndex: 1 }), false);
    });
});

describe('scrollVolume', () => {
    const step = VOLUME_SCROLL_STEP * MAX;
    const at = (volume, muted = false) => ({ volume, maxNorm: MAX, muted });

    test('a notch up or down moves the volume one step, like GNOME', () => {
        assert.deepEqual(scrollVolume(at(MAX / 2), { kind: 'discrete', direction: 'up' }),
            { volume: Math.round(MAX / 2 + step), muted: false, changed: true });
        assert.deepEqual(scrollVolume(at(MAX / 2), { kind: 'discrete', direction: 'down' }),
            { volume: Math.round(MAX / 2 - step), muted: false, changed: true });
    });

    test('a touchpad moves it in proportion, scrolling up for louder', () => {
        assert.equal(scrollVolume(at(MAX / 2), { kind: 'smooth', dx: 0, dy: -0.5 }).volume, Math.round(MAX / 2 + step / 2));
    });

    test('scrolling never pushes past 100 % nor cuts a boosted volume', () => {
        assert.equal(scrollVolume(at(MAX), { kind: 'discrete', direction: 'up' }).volume, MAX);
        assert.equal(scrollVolume(at(MAX * 1.2), { kind: 'discrete', direction: 'up' }).volume, Math.round(MAX * 1.2));
        assert.equal(scrollVolume(at(MAX * 1.2), { kind: 'discrete', direction: 'down' }).volume, Math.round(MAX * 1.2 - step));
    });

    test('reaching zero mutes, and turning it up again unmutes', () => {
        assert.deepEqual(scrollVolume(at(step / 2), { kind: 'discrete', direction: 'down' }), { volume: 0, muted: true, changed: true });
        assert.deepEqual(scrollVolume(at(0, true), { kind: 'discrete', direction: 'up' }),
            { volume: Math.round(step), muted: false, changed: true });
    });

    test('scrolling down while muted keeps it muted and keeps the saved volume', () => {
        assert.deepEqual(scrollVolume(at(MAX * 0.3, true), { kind: 'discrete', direction: 'down' }),
            { volume: MAX * 0.3, muted: true, changed: false });
    });

    test('scrolling up while muted starts from silence, like GNOME\'s slider', () => {
        assert.deepEqual(scrollVolume(at(MAX * 0.3, true), { kind: 'discrete', direction: 'up' }),
            { volume: Math.round(step), muted: false, changed: true });
    });

    test('sideways scrolling and unknown events change nothing', () => {
        assert.equal(scrollVolume(at(MAX / 2), { kind: 'discrete', direction: 'left' }).changed, false);
        assert.equal(scrollVolume(at(MAX / 2), { kind: 'smooth', dx: 3, dy: 0 }).changed, false);
    });
});

describe('volumeIconName', () => {
    test('follows GNOME\'s four volume icons', () => {
        assert.equal(volumeIconName(0, MAX, false), 'audio-volume-muted-symbolic');
        assert.equal(volumeIconName(MAX * 0.2, MAX, false), 'audio-volume-low-symbolic');
        assert.equal(volumeIconName(MAX * 0.5, MAX, false), 'audio-volume-medium-symbolic');
        assert.equal(volumeIconName(MAX, MAX, false), 'audio-volume-high-symbolic');
        assert.equal(volumeIconName(MAX * 1.2, MAX, false), 'audio-volume-overamplified-symbolic');
    });

    test('shows muted whenever the sound is muted', () => {
        assert.equal(volumeIconName(MAX, MAX, true), 'audio-volume-muted-symbolic');
    });
});
