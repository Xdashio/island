// The pill: wraps the top bar clock (GNOME's date menu button) with cover art on the left and a
// small level meter on the right. The clock keeps working as before: a click opens the calendar.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import St from 'gi://St';

import { nextLevels } from './geometry.js';

const BAR_COUNT = 3;
// The meter steps a few times a second instead of animating every frame: cheap on Intel HD 3000.
const METER_STEP_MS = 160;
const DND_ICON = 'notifications-disabled-symbolic';
const FALLBACK_ICON = 'audio-x-generic-symbolic';
// Every mouse button is taken, so no click on the cover or meter falls through to the calendar
const ALL_BUTTONS = St.ButtonMask.ONE | St.ButtonMask.TWO | St.ButtonMask.THREE;

/** A round cover with an icon shown when there is no cover. Shared by the pill and the card. */
export class Cover {
    constructor(styleClass, iconClass) {
        this._icon = new St.Icon({
            style_class: iconClass,
            icon_name: FALLBACK_ICON,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
        });
        this.actor = new St.Bin({ style_class: styleClass, child: this._icon });
    }

    /** uri from art.js, or null to show the app icon (or a note) instead. */
    set(uri, fallbackGicon) {
        this.actor.style = uri ? `background-image: url("${uri}");` : null;
        this._icon.visible = !uri;
        if (fallbackGicon)
            this._icon.gicon = fallbackGicon;
        else
            this._icon.icon_name = FALLBACK_ICON;
    }
}

export class IslandPill {
    constructor(dateMenu) {
        this._dateMenu = dateMenu;
        this._clock = dateMenu._clockDisplay;
        this._indicator = dateMenu._indicator;
        this._clockBox = this._clock.get_parent();
        // GNOME pads the left of the clock with an invisible copy of the indicator; inside a pill that
        // reads as uneven padding, so it sits out while the island is on.
        this._pad = this._clockBox.get_children().find(c => c !== this._clock && c !== this._indicator) ?? null;
        this._playing = false;
        this._meterId = 0;

        this.cover = new Cover('xi-art', 'xi-art-icon');
        this.art = new St.Button({
            style_class: 'xi-art-button',
            child: this.cover.actor,
            accessible_name: 'Now playing',
            button_mask: ALL_BUTTONS,
            track_hover: true,
            visible: false,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const bars = new St.BoxLayout({ style_class: 'xi-meter' });
        this._bars = Array.from({ length: BAR_COUNT }, () => {
            const bar = new St.Widget({
                style_class: 'xi-meter-bar',
                pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
                y_align: Clutter.ActorAlign.CENTER,
            });
            bars.add_child(bar);
            return bar;
        });
        this.meter = new St.Button({
            style_class: 'xi-meter-button',
            child: bars,
            accessible_name: 'Media controls',
            button_mask: ALL_BUTTONS,
            track_hover: true,
            visible: false,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this.actor = new St.BoxLayout({ style_class: 'xi-pill', y_align: Clutter.ActorAlign.CENTER });
        if (this._pad)
            this._clockBox.remove_child(this._pad);
        dateMenu.remove_child(this._clockBox);
        this.actor.add_child(this.art);
        this.actor.add_child(this._clockBox);
        this.actor.add_child(this.meter);
        dateMenu.add_child(this.actor);

        this._indicatorId = this._indicator.connect('notify::icon-name', () => this._syncIndicator());
        this._syncIndicator();
        this.actor.connect('notify::mapped', () => this._syncMeter());
        this._applyLevels(nextLevels(Math.random, false, BAR_COUNT));
    }

    destroy() {
        this._stopMeter();
        this._indicator.disconnect(this._indicatorId);
        this._indicator.remove_style_class_name('xi-dnd');
        // Take the clock out first: destroying the pill would destroy it too
        this.actor.remove_child(this._clockBox);
        if (this._pad)
            this._clockBox.insert_child_at_index(this._pad, 0);
        this._dateMenu.remove_child(this.actor);
        this._dateMenu.add_child(this._clockBox);
        this.actor.destroy();
    }

    /** state from mediaState(), or null for a plain clock pill. */
    setMedia(state) {
        const hasMedia = !!state;
        this.art.visible = hasMedia;
        this.meter.visible = hasMedia;
        this._playing = hasMedia && state.playing;
        this._toggleClass(this.actor, 'xi-has-media', hasMedia);
        this._toggleClass(this.actor, 'xi-paused', hasMedia && !state.playing);
        this._syncMeter();
    }

    _toggleClass(actor, name, on) {
        if (on)
            actor.add_style_class_name(name);
        else
            actor.remove_style_class_name(name);
    }

    // Unread notifications show in the accent colour; Do Not Disturb stays quiet grey
    _syncIndicator() {
        this._toggleClass(this._indicator, 'xi-dnd', this._indicator.icon_name === DND_ICON);
    }

    _syncMeter() {
        if (this._playing && this.actor.mapped) {
            if (!this._meterId) {
                this._meterId = GLib.timeout_add(GLib.PRIORITY_LOW, METER_STEP_MS, () => {
                    this._applyLevels(nextLevels(Math.random, true, BAR_COUNT));
                    return GLib.SOURCE_CONTINUE;
                });
            }
            return;
        }
        this._stopMeter();
        this._applyLevels(nextLevels(Math.random, false, BAR_COUNT));
    }

    _stopMeter() {
        if (this._meterId)
            GLib.source_remove(this._meterId);
        this._meterId = 0;
    }

    _applyLevels(levels) {
        levels.forEach((level, i) => {
            this._bars[i].scale_y = level;
        });
    }
}
