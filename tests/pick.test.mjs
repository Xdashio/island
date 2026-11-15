import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { rankPlayer, pickPlayer, IGNORED_PLAYERS } from '../src/lib/pick.js';

const player = (id, status, rawTitle) => ({ id, busName: id, status, rawTitle });

describe('rankPlayer', () => {
    test('playing with a title ranks highest', () => {
        assert.equal(rankPlayer(player('a', 'Playing', 'Song')), 3);
    });

    test('paused with a title ranks below playing', () => {
        assert.equal(rankPlayer(player('a', 'Paused', 'Song')), 2);
    });

    test('a live player without a title still ranks above nothing', () => {
        assert.equal(rankPlayer(player('a', 'Playing', undefined)), 1);
    });

    test('stopped, missing status and empty titles do not show', () => {
        assert.equal(rankPlayer(player('a', 'Stopped', 'Song')), 0);
        assert.equal(rankPlayer(player('a', null, 'Song')), 0);
        assert.equal(rankPlayer(player('a', 'Playing', '')), 0);
        assert.equal(rankPlayer(null), 0);
    });

    test('the old Dynamic Island idle player is ignored', () => {
        const [busName] = IGNORED_PLAYERS;
        assert.equal(rankPlayer({ id: busName, busName, status: 'Paused', rawTitle: 'Dynamic Island' }), 0);
    });
});

describe('pickPlayer', () => {
    test('returns null when nothing can show', () => {
        assert.equal(pickPlayer([], null, null), null);
        assert.equal(pickPlayer([player('a', 'Stopped', 'x')], null, null), null);
    });

    test('prefers a playing player over a paused one', () => {
        const players = [player('a', 'Paused', 'x'), player('b', 'Playing', 'y')];
        assert.equal(pickPlayer(players, null, null), 'b');
    });

    test('keeps the current player on a tie', () => {
        const players = [player('a', 'Playing', 'x'), player('b', 'Playing', 'y')];
        assert.equal(pickPlayer(players, 'b', null), 'b');
    });

    test('the player that just started playing takes over on a tie', () => {
        const players = [player('a', 'Playing', 'x'), player('b', 'Playing', 'y')];
        assert.equal(pickPlayer(players, 'a', 'b'), 'b');
    });

    test('a changed player that is paused does not steal the island', () => {
        const players = [player('a', 'Paused', 'x'), player('b', 'Paused', 'y')];
        assert.equal(pickPlayer(players, 'a', 'b'), 'a');
    });

    test('drops a current id that no longer exists', () => {
        const players = [player('a', 'Paused', 'x')];
        assert.equal(pickPlayer(players, 'gone', null), 'a');
    });
});
