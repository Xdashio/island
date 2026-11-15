import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    cardPosition,
    nextLevels,
    MIN_LEVEL,
    fitSize,
    isSafeImageSize,
    isAllowedImageFormat,
    MAX_IMAGE_SIDE,
} from '../src/lib/geometry.js';

describe('isAllowedImageFormat', () => {
    test('accepts the formats players use for covers', () => {
        for (const format of ['png', 'jpeg', 'gif', 'webp', 'bmp'])
            assert.equal(isAllowedImageFormat(format), true, format);
    });

    test('skips exotic and vector loaders', () => {
        for (const format of ['svg', 'wmf', 'heif', 'icns', 'ani', 'qtif', '', undefined, null])
            assert.equal(isAllowedImageFormat(format), false, String(format));
    });
});

describe('fitSize', () => {
    test('scales a wide thumbnail down to fit, keeping its shape', () => {
        assert.deepEqual(fitSize(1280, 720, 96), [96, 54]);
    });

    test('scales a tall image by its height', () => {
        assert.deepEqual(fitSize(300, 600, 96), [48, 96]);
    });

    test('never scales up and never returns zero', () => {
        assert.deepEqual(fitSize(40, 30, 96), [40, 30]);
        assert.deepEqual(fitSize(4000, 1, 96), [96, 1]);
    });
});

describe('isSafeImageSize', () => {
    test('accepts normal covers', () => {
        assert.equal(isSafeImageSize(640, 640), true);
        assert.equal(isSafeImageSize(MAX_IMAGE_SIDE, MAX_IMAGE_SIDE), true);
    });

    test('rejects huge or empty images before they are decoded', () => {
        assert.equal(isSafeImageSize(30000, 30000), false);
        assert.equal(isSafeImageSize(MAX_IMAGE_SIDE + 1, 10), false);
        assert.equal(isSafeImageSize(0, 10), false);
        assert.equal(isSafeImageSize(10, -1), false);
    });
});

describe('cardPosition', () => {
    const base = { anchorX: 533, anchorWidth: 300, top: 28, cardWidth: 300, monitorX: 0, monitorWidth: 1366 };

    test('centres the card under the pill, a small gap below the bar', () => {
        assert.deepEqual(cardPosition(base), { x: 533, y: 34 });
    });

    test('rounds to whole pixels so text stays sharp', () => {
        const { x } = cardPosition({ ...base, anchorX: 533.4, anchorWidth: 301 });
        assert.equal(Number.isInteger(x), true);
    });

    test('keeps the card inside the monitor edges', () => {
        assert.equal(cardPosition({ ...base, anchorX: 0, anchorWidth: 40 }).x, 8);
        assert.equal(cardPosition({ ...base, anchorX: 1340, anchorWidth: 20 }).x, 1366 - 300 - 8);
    });

    test('works on a monitor that does not start at 0', () => {
        assert.equal(cardPosition({ ...base, anchorX: 1366, anchorWidth: 40, monitorX: 1366 }).x, 1366 + 8);
    });
});

describe('nextLevels', () => {
    test('is flat while paused', () => {
        assert.deepEqual(nextLevels(() => 0.9, false, 3), [MIN_LEVEL, MIN_LEVEL, MIN_LEVEL]);
    });

    test('stays between the floor and full height while playing', () => {
        for (const r of [0, 0.5, 0.999]) {
            for (const level of nextLevels(() => r, true, 3)) {
                assert.ok(level >= MIN_LEVEL && level <= 1, `level ${level} out of range`);
            }
        }
    });

    test('returns one level per bar', () => {
        assert.equal(nextLevels(Math.random, true, 5).length, 5);
    });
});
