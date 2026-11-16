import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { notificationRoute, plainText, peekText, PEEK_MODES, CRITICAL } from '../src/lib/peek.js';

describe('notificationRoute', () => {
    const normal = { mode: 'instead', urgency: 1, fullscreen: false };

    test('the pill takes ordinary notifications instead of the banner', () => {
        assert.equal(notificationRoute(normal), 'peek');
    });

    test('critical notifications keep GNOME\'s banner as well', () => {
        assert.equal(notificationRoute({ ...normal, urgency: CRITICAL }), 'both');
    });

    test('alongside mode shows both', () => {
        assert.equal(notificationRoute({ ...normal, mode: 'with-banner' }), 'both');
    });

    test('with the notification list already open, GNOME shows it there and as a banner', () => {
        assert.equal(notificationRoute({ ...normal, menuOpen: true }), 'banner');
    });

    test('off, fullscreen and unknown modes leave everything to GNOME', () => {
        assert.equal(notificationRoute({ ...normal, mode: 'off' }), 'banner');
        assert.equal(notificationRoute({ ...normal, fullscreen: true }), 'banner');
        assert.equal(notificationRoute({ ...normal, mode: 'sideways' }), 'banner');
    });

    test('lists the three modes the setting allows', () => {
        assert.deepEqual(PEEK_MODES, ['instead', 'with-banner', 'off']);
    });
});

describe('plainText', () => {
    test('strips markup and decodes entities when the body uses markup', () => {
        assert.equal(plainText('<b>Build</b> passed &amp; deployed &#39;now&#39; &#x21;', true), 'Build passed & deployed \'now\' !');
    });

    test('leaves angle brackets alone in plain text', () => {
        assert.equal(plainText('I <3 this', false), 'I <3 this');
    });

    test('puts everything on one line', () => {
        assert.equal(plainText('  first line\n\n second\tline  ', false), 'first line second line');
    });

    test('treats anything that is not text as empty', () => {
        assert.equal(plainText(null, false), '');
        assert.equal(plainText(undefined, true), '');
    });
});

describe('peekText', () => {
    test('shows the title and the body', () => {
        assert.deepEqual(peekText({ title: 'Ada', body: 'Lunch at 1?', useMarkup: false, appName: 'Chat' }),
            { title: 'Ada', body: 'Lunch at 1?' });
    });

    test('falls back to the app name when there is no title', () => {
        assert.deepEqual(peekText({ title: '', body: 'Download finished', useMarkup: false, appName: 'Brave' }),
            { title: 'Brave', body: 'Download finished' });
    });

    test('does not repeat the title as the body', () => {
        assert.deepEqual(peekText({ title: 'Saved', body: 'Saved', useMarkup: false, appName: '' }),
            { title: 'Saved', body: '' });
    });

    test('always has something to show', () => {
        assert.deepEqual(peekText({ title: '', body: '', useMarkup: false, appName: '' }),
            { title: 'Notification', body: '' });
    });
});
