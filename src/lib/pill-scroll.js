// Scrolling on the pill: the cover skips tracks (or jumps ten seconds in a single video), the meter
// changes the system volume through GNOME's shared mixer and shows the level like the volume keys do.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Volume from 'resource:///org/gnome/shell/ui/status/volume.js';

import { scrollVolume, volumeIconName } from './levels.js';
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

    // The same mixer GNOME's speaker icon uses; without an output device there is nothing to change
    _onMeter(event) {
        if (!this._enabled())
            return Clutter.EVENT_PROPAGATE;
        const input = scrollInput(event);
        const control = Volume.getMixerControl();
        const sink = control.get_default_sink();
        if (!input || !sink)
            return Clutter.EVENT_PROPAGATE;
        const maxNorm = control.get_vol_max_norm();
        const next = scrollVolume({ volume: sink.volume, maxNorm, muted: sink.is_muted }, input);
        if (next.changed) {
            sink.volume = next.volume;
            if (next.muted !== sink.is_muted)
                sink.change_is_muted(next.muted);
            sink.push_volume();
        }
        // Shown in the pill, or as GNOME's pop-up when that setting is off or the bar is hidden
        const level = next.muted ? 0 : next.volume / maxNorm;
        const icon = new Gio.ThemedIcon({ name: volumeIconName(next.volume, maxNorm, next.muted) });
        Main.osdWindowManager.show(-1, icon, null, level, Math.max(1, level));
        return Clutter.EVENT_STOP;
    }
}
