import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_ACCENT,
    normalizeHex,
    hexToRgb,
    rgbaToHex,
    pillAlphas,
    themeCss,
} from '../src/lib/theme.js';

describe('normalizeHex', () => {
    test('accepts six and three digit colours in any case', () => {
        assert.equal(normalizeHex('#7AA2F7'), '#7aa2f7');
        assert.equal(normalizeHex('#abc'), '#aabbcc');
        assert.equal(normalizeHex('  #7aa2f7 '), '#7aa2f7');
    });

    test('rejects anything that is not a hex colour', () => {
        for (const bad of ['7aa2f7', '#7aa2f', '#gggggg', 'blue', '', null, undefined, '#7aa2f7; color: red'])
            assert.equal(normalizeHex(bad), null, String(bad));
    });
});

describe('hexToRgb', () => {
    test('splits a colour into bytes', () => {
        assert.deepEqual(hexToRgb('#7aa2f7'), [122, 162, 247]);
    });

    test('falls back to the default accent for bad input', () => {
        assert.deepEqual(hexToRgb('nope'), hexToRgb(DEFAULT_ACCENT));
    });
});

describe('rgbaToHex', () => {
    test('turns a GTK colour (0 to 1 floats) into hex', () => {
        assert.equal(rgbaToHex({ red: 122 / 255, green: 162 / 255, blue: 247 / 255 }), '#7aa2f7');
    });

    test('clamps out of range channels', () => {
        assert.equal(rgbaToHex({ red: 2, green: -1, blue: 0.5 }), '#ff0080');
    });
});

describe('pillAlphas', () => {
    test('turns a percentage into rest, hover and open alphas', () => {
        assert.deepEqual(pillAlphas(62), { rest: 0.62, hover: 0.74, open: 0.8 });
    });

    test('never goes past fully opaque', () => {
        assert.deepEqual(pillAlphas(95), { rest: 0.95, hover: 1, open: 1 });
    });

    test('clamps to the allowed range', () => {
        assert.equal(pillAlphas(5).rest, 0.2);
        assert.equal(pillAlphas(150).rest, 1);
        assert.equal(pillAlphas(Number.NaN).rest, 0.62);
    });
});

describe('themeCss', () => {
    const css = themeCss({ accent: '#bb9af7', pillOpacity: 70 });

    test('uses the chosen accent everywhere the accent shows', () => {
        assert.match(css, /\.xi-meter-bar \{[^}]*background-color: #bb9af7;/);
        assert.match(css, /\.messages-indicator \{[^}]*color: #bb9af7;/);
        assert.match(css, /\.xi-card-app \{[^}]*color: #bb9af7;/);
        assert.match(css, /\.slider\.xi-card-slider \{[^}]*-barlevel-active-background-color: #bb9af7;/);
        assert.match(css, /\.xi-control\.xi-control-play \{[^}]*rgba\(187, 154, 247, 0\.16\)/);
        assert.doesNotMatch(css, /122, 162, 247/);
    });

    test('sets the pill darkness for rest, hover and open', () => {
        assert.match(css, /\.xi-pill \{[^}]*rgba\(26, 27, 38, 0\.7\)/);
        assert.match(css, /:hover \.xi-pill \{[^}]*rgba\(26, 27, 38, 0\.82\)/);
        assert.match(css, /:checked \.xi-pill \{[^}]*rgba\(26, 27, 38, 0\.88\)/);
    });

    test('falls back to the defaults for bad settings', () => {
        const fallback = themeCss({ accent: 'red; } * { color: red', pillOpacity: 'x' });
        assert.match(fallback, /background-color: #7aa2f7;/);
        assert.doesNotMatch(fallback, /color: red/);
    });

    test('never writes an em dash', () => {
        assert.doesNotMatch(css, /\u2014/);
    });
});
