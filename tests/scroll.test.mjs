import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    initialScrollState,
    scrollAction,
    coverAction,
    COOLDOWN_MS,
    IDLE_RESET_MS,
    SMOOTH_THRESHOLD,
    SEEK_STEP_US,
} from '../src/lib/scroll.js';

const wheel = (direction, time) => ({ kind: 'discrete', direction, time });
const swipe = (dx, dy, time) => ({ kind: 'smooth', dx, dy, time });

// Feeds events in order and returns the actions, so whole gestures read as one line
function run(events) {
    let state = initialScrollState();
    return events.map(event => {
        const [action, next] = scrollAction(state, event);
        state = next;
        return action;
    });
}

describe('scrollAction with a mouse wheel', () => {
    test('down and right go to the next track, up and left to the previous', () => {
        assert.deepEqual(run([wheel('down', 1000)]), ['next']);
        assert.deepEqual(run([wheel('right', 1000)]), ['next']);
        assert.deepEqual(run([wheel('up', 1000)]), ['previous']);
        assert.deepEqual(run([wheel('left', 1000)]), ['previous']);
    });

    test('a fast spin skips once, then again after the cool-down', () => {
        assert.deepEqual(
            run([wheel('down', 1000), wheel('down', 1050), wheel('down', 1100), wheel('down', 1000 + COOLDOWN_MS + 1)]),
            ['next', null, null, 'next']);
    });
});

describe('scrollAction with a touchpad', () => {
    test('small movements add up to one skip', () => {
        const step = SMOOTH_THRESHOLD / 3;
        assert.deepEqual(run([swipe(0, step, 1000), swipe(0, step, 1010), swipe(0, step * 1.01, 1020)]),
            [null, null, 'next']);
    });

    test('scrolling up goes to the previous track', () => {
        assert.deepEqual(run([swipe(0, -SMOOTH_THRESHOLD, 1000)]), ['previous']);
    });

    test('a sideways swipe uses the horizontal movement', () => {
        assert.deepEqual(run([swipe(SMOOTH_THRESHOLD, 0.1, 1000)]), ['next']);
        assert.deepEqual(run([swipe(-SMOOTH_THRESHOLD, 0.1, 1000)]), ['previous']);
    });

    test('a pause between movements starts the count again', () => {
        const half = SMOOTH_THRESHOLD * 0.6;
        assert.deepEqual(run([swipe(0, half, 1000), swipe(0, half, 1000 + IDLE_RESET_MS + 1)]), [null, null]);
    });

    test('momentum after a skip is swallowed instead of skipping again', () => {
        assert.deepEqual(
            run([swipe(0, SMOOTH_THRESHOLD, 1000), swipe(0, SMOOTH_THRESHOLD, 1100), swipe(0, SMOOTH_THRESHOLD, 1200)]),
            ['next', null, null]);
    });

    test('one long continuous swipe skips only once', () => {
        const events = Array.from({ length: 60 }, (_, i) => swipe(0, SMOOTH_THRESHOLD / 4, 1000 + i * 10));
        assert.equal(run(events).filter(Boolean).length, 1);
    });

    test('a new swipe after the fingers rest skips again', () => {
        const actions = run([
            swipe(0, SMOOTH_THRESHOLD, 1000),
            swipe(0, SMOOTH_THRESHOLD, 1000 + IDLE_RESET_MS + COOLDOWN_MS),
        ]);
        assert.deepEqual(actions, ['next', 'next']);
    });

    test('lifting the fingers ends the gesture, so the next swipe can skip after the cool-down', () => {
        const actions = run([
            swipe(0, SMOOTH_THRESHOLD, 1000),
            swipe(0, 0.1, 1100),
            { ...swipe(0, 0, 1150), finished: true },
            swipe(0, SMOOTH_THRESHOLD, 1000 + COOLDOWN_MS + 10),
        ]);
        assert.deepEqual(actions, ['next', null, null, 'next']);
    });
});

describe('scrollAction state', () => {
    test('never changes the state it was given', () => {
        const state = initialScrollState();
        const frozen = { ...state };
        scrollAction(state, swipe(0, SMOOTH_THRESHOLD / 2, 1000));
        assert.deepEqual(state, frozen);
    });

    test('survives the event clock wrapping around', () => {
        const [, afterSkip] = scrollAction(initialScrollState(), wheel('down', 4_294_967_000));
        const [action] = scrollAction(afterSkip, wheel('down', 50));
        assert.equal(action, 'next');
    });

    test('ignores events it does not understand', () => {
        const [action] = scrollAction(initialScrollState(), { kind: 'discrete', direction: 'sideways', time: 1 });
        assert.equal(action, null);
    });
});

describe('coverAction', () => {
    const state = { canGoNext: true, canGoPrevious: true, canSeek: true };

    test('skips tracks when the player can', () => {
        assert.deepEqual(coverAction('next', state), { type: 'next' });
        assert.deepEqual(coverAction('previous', state), { type: 'previous' });
    });

    test('jumps ten seconds in a single video that cannot skip', () => {
        const video = { canGoNext: false, canGoPrevious: false, canSeek: true };
        assert.deepEqual(coverAction('next', video), { type: 'seek', offsetUs: SEEK_STEP_US });
        assert.deepEqual(coverAction('previous', video), { type: 'seek', offsetUs: -SEEK_STEP_US });
    });

    test('does nothing when the player can neither skip nor seek', () => {
        const stream = { canGoNext: false, canGoPrevious: false, canSeek: false };
        assert.equal(coverAction('next', stream), null);
        assert.equal(coverAction(null, state), null);
        assert.equal(coverAction('next', null), null);
    });
});
