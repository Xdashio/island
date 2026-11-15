// The card's progress bar: GNOME's own slider, restyled thin, with elapsed and remaining time under it.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';

import { progressInfo } from './progress.js';

// Arrow keys and smooth scrolling move the bar many times a second; the player gets one seek per burst
const KEY_SEEK_MS = 150;

export class SeekBar {
    /** onSeek(fraction) runs when the user moves the bar; onDragEnd() when a drag ends. */
    constructor({ onSeek, onDragEnd }) {
        this._onSeek = onSeek;
        this._length = 0;
        this._dragging = false;
        this._cancelling = false;
        this._syncing = false;
        this._seekTimerId = 0;

        this._slider = new Slider.Slider(0);
        this._slider.add_style_class_name('xi-card-slider');
        this._slider.accessible_name = 'Position';
        this._elapsed = new St.Label({ style_class: 'xi-card-time', x_expand: true });
        this._remaining = new St.Label({ style_class: 'xi-card-time', x_align: Clutter.ActorAlign.END });
        const times = new St.BoxLayout({ style_class: 'xi-card-times' });
        times.add_child(this._elapsed);
        times.add_child(this._remaining);

        this.actor = new St.BoxLayout({ style_class: 'xi-card-progress', vertical: true, visible: false });
        this.actor.add_child(this._slider);
        this.actor.add_child(times);

        // A click is a short drag, so it seeks on release too
        this._slider.connect('drag-begin', () => {
            this._dragging = true;
        });
        this._slider.connect('drag-end', () => {
            this._dragging = false;
            if (this._cancelling)
                return;
            onSeek(this._slider.value);
            onDragEnd();
        });
        // The times preview the target at once; arrow keys and scrolling seek once they settle
        this._slider.connect('notify::value', () => {
            if (this._syncing)
                return;
            this._showTimes(this._slider.value * this._length);
            if (!this._dragging)
                this._queueSeek();
        });
    }

    get isDragging() {
        return this._dragging;
    }

    /** Ends a drag without seeking, for when the card closes under the pointer. */
    cancelDrag() {
        if (!this._dragging)
            return;
        this._cancelling = true;
        // GNOME's slider has no public way to end a drag; this releases its pointer grab
        if (typeof this._slider._endDragging === 'function')
            this._slider._endDragging();
        this._cancelling = false;
        this._dragging = false;
    }

    destroy() {
        this.cancelDrag();
        if (this._seekTimerId)
            GLib.source_remove(this._seekTimerId);
        this._seekTimerId = 0;
    }

    _queueSeek() {
        if (this._seekTimerId)
            return;
        this._seekTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, KEY_SEEK_MS, () => {
            this._seekTimerId = 0;
            this._onSeek(this._slider.value);
            return GLib.SOURCE_REMOVE;
        });
    }

    /** lengthUs 0 hides the bar (live streams); without canSeek it only shows progress. */
    setTrack(lengthUs, canSeek) {
        this._length = lengthUs;
        this.actor.visible = lengthUs > 0;
        this._slider.reactive = canSeek;
        this._slider.can_focus = canSeek;
    }

    setPosition(positionUs) {
        // The user's pending choice wins over a position read
        if (this._dragging || this._seekTimerId)
            return;
        const info = this._showTimes(positionUs);
        if (!info)
            return;
        this._syncing = true;
        this._slider.value = info.fraction;
        this._syncing = false;
    }

    _showTimes(positionUs) {
        const info = progressInfo(positionUs, this._length);
        if (info) {
            this._elapsed.text = info.elapsed;
            this._remaining.text = info.remaining;
        }
        return info;
    }
}
