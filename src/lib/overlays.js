// The pill's brief takeovers of the clock: volume and brightness levels, and notification peeks.
// The newest one wins; each ends on its own timer, when the calendar opens, or when its notification goes.
import GLib from 'gi://GLib';

import { NotificationBridge } from './notifications.js';
import { OsdBridge } from './osd.js';
import { peekText } from './peek.js';

// After the last key press or scroll
const LEVEL_SHOW_MS = 1500;
// Long enough to read a title and a short line
const PEEK_SHOW_MS = 4000;

export class Overlays {
    /** menuOpen() says whether the date menu (calendar and notification list) is open. */
    constructor(pill, settings, menuOpen) {
        this._pill = pill;
        this._timerId = 0;
        this._peek = null;
        this._osd = new OsdBridge(() => settings.get_boolean('levels-in-pill'), info => this._showLevel(info));
        this._notifications = new NotificationBridge({
            mode: () => settings.get_string('notification-peek'),
            menuOpen,
            peeking: () => this._peek?.notification ?? null,
            onPeek: (notification, replacedBanner) => this._showPeek(notification, replacedBanner),
        });
    }

    destroy() {
        // GNOME's own pop-ups come back first, then its banners, with the current peek settled
        this._osd.destroy();
        this._clearTimer();
        const peek = this._releasePeek();
        if (peek)
            this._notifications.finish(peek.notification, peek.replacedBanner, peek.destroyed);
        this._notifications.destroy();
    }

    /** Ends whatever the pill is showing in the clock's place, for example when the calendar opens. */
    dismiss() {
        this._clearTimer();
        this._pill.hideOverlay();
        this._endPeek();
    }

    _showLevel(info) {
        if (!this._pill.showLevel(info))
            return;
        this._endPeek();
        this._restartTimer(LEVEL_SHOW_MS);
    }

    _showPeek(notification, replacedBanner) {
        this._endPeek();
        const text = peekText({
            title: notification.title,
            body: notification.body,
            useMarkup: notification.useBodyMarkup,
            appName: notification.source?.title ?? '',
        });
        this._pill.showPeek({ gicon: notification.gicon ?? notification.source?.icon ?? null, ...text });
        const peek = { notification, replacedBanner, destroyed: false, destroyId: 0 };
        // A notification dismissed or withdrawn while it shows takes its peek with it
        peek.destroyId = notification.connect('destroy', () => {
            peek.destroyed = true;
            peek.destroyId = 0;
            if (this._peek === peek)
                this.dismiss();
        });
        this._peek = peek;
        this._restartTimer(PEEK_SHOW_MS);
    }

    _restartTimer(ms) {
        this._clearTimer();
        this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._timerId = 0;
            this.dismiss();
            return GLib.SOURCE_REMOVE;
        });
    }

    _clearTimer() {
        if (this._timerId)
            GLib.source_remove(this._timerId);
        this._timerId = 0;
    }

    // Lets GNOME finish with the notification as it would after a banner
    _endPeek() {
        const peek = this._releasePeek();
        if (peek)
            this._notifications.finish(peek.notification, peek.replacedBanner, peek.destroyed);
    }

    _releasePeek() {
        const peek = this._peek;
        this._peek = null;
        if (peek?.destroyId)
            peek.notification.disconnect(peek.destroyId);
        return peek;
    }
}
