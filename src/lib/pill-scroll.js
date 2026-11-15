// Scrolling on the pill: the cover skips tracks (or jumps ten seconds in a single video), the meter
// changes the system volume exactly like scrolling over GNOME's speaker icon, pop-up included.
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { coverAction, initialScrollState, scrollAction } from './scroll.js';

const DIRECTIONS = new Map([
    [Clutter.ScrollDirection.UP, 'up'],
    [Clutter.ScrollDirection.DOWN, 'down'],
    [Clutter.ScrollDirection.LEFT, 'left'],
    [Clutter.ScrollDirection.RIGHT, 'right'],
]);

// Wheels on smooth-scrolling devices also send emulated notches; only the real events count
function scrollInput(event) {
    if (event.get_flags() & Clutter.EventFlags.FLAG_POINTER_EMULATED)
        return null;
    const time = event.get_time();
    const direction = event.get_scroll_direction();
    if (direction === Clutter.ScrollDirection.SMOOTH) {
        const [dx, dy] = event.get_scroll_delta();
        // Any finish flag (horizontal or vertical) means the fingers lifted
        const finished = event.get_scroll_finish_flags() !== 0;
        return { kind: 'smooth', dx, dy, time, finished };
    }
    return { kind: 'discrete', direction: DIRECTIONS.get(direction), time };
}

export class PillScroll {
    /** media() returns {state, client} for the player on show. */
    constructor(pill, settings, media) {
        this._pill = pill;
        this._settings = settings;
        this._media = media;
        this._state = initialScrollState();
        this._coverId = pill.art.connect('scroll-event', (_actor, event) => this._onCover(event));
        this._meterId = pill.meter.connect('scroll-event', (_actor, event) => this._onMeter(event));
    }

    destroy() {
        this._pill.art.disconnect(this._coverId);
        this._pill.meter.disconnect(this._meterId);
    }

    _enabled() {
        return this._settings.get_boolean('scroll-actions');
    }

    _onCover(event) {
        if (!this._enabled())
            return Clutter.EVENT_PROPAGATE;
        const input = scrollInput(event);
        if (!input)
            return Clutter.EVENT_PROPAGATE;
        const [action, next] = scrollAction(this._state, input);
        const { state, client } = this._media();
        const what = coverAction(action, state);
        // A skip the player cannot take does not start the cool-down
        this._state = action && !what ? { ...this._state, acc: 0, lastEventAt: input.time } : next;
        if (what?.type === 'next')
            client?.next();
        else if (what?.type === 'previous')
            client?.previous();
        else if (what?.type === 'seek')
            client?.seekBy(what.offsetUs);
        return Clutter.EVENT_STOP;
    }

    // GNOME 46's volume indicator; if a future GNOME renames it, the scroll is simply not taken
    _onMeter(event) {
        const volume = Main.panel.statusArea.quickSettings?._volumeOutput;
        // Without an output device GNOME hides its own speaker icon, so there is nothing to change
        if (!this._enabled() || !volume?._output?.stream || typeof volume._handleScrollEvent !== 'function')
            return Clutter.EVENT_PROPAGATE;
        return volume._handleScrollEvent(volume._output, event);
    }
}
