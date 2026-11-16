// Sends new notifications to the pill. GNOME queues every banner and shows it with
// MessageTray._showNotification(), which it looks up afresh each time, so that one method is
// overridden (GNOME's InjectionManager, restored exactly on disable). GNOME's own rules still apply:
// nothing reaches it in Do Not Disturb, for low urgency, or in fullscreen.
import GLib from 'gi://GLib';
import { InjectionManager } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import { notificationRoute } from './peek.js';

export class NotificationBridge {
    /**
     * mode() reads the notification-peek setting, menuOpen() says whether the notification list is open,
     * peeking() returns the notification the pill shows now (or null), and
     * onPeek(notification, replacedBanner) shows one in the pill.
     */
    constructor({ mode, menuOpen, peeking, onPeek }) {
        this._peeking = peeking;
        // Cleanups owed to GNOME after a peek that replaced its banner, by idle source id
        this._pending = new Map();
        this._injections = new InjectionManager();
        this._injections.overrideMethod(Main.messageTray, '_showNotification', original => {
            return function () {
                const notification = Array.isArray(this._notificationQueue) ? this._notificationQueue[0] : null;
                if (!notification)
                    return original.call(this);
                const route = notificationRoute({
                    mode: mode(),
                    urgency: notification.urgency,
                    fullscreen: !!Main.layoutManager.primaryMonitor?.inFullscreen,
                    menuOpen: menuOpen(),
                });
                if (route === 'banner')
                    return original.call(this);
                if (route === 'both') {
                    onPeek(notification, false);
                    return original.call(this);
                }
                // One peek at a time, like one banner at a time: the rest wait in GNOME's queue
                if (peeking())
                    return undefined;
                // The pill instead of the banner: off the queue, then what showing a banner does
                this._notificationQueue.shift();
                this.emit('queue-changed');
                notification.acknowledged = true;
                notification.playSound();
                onPeek(notification, true);
                return undefined;
            };
        });
    }

    /** Puts GNOME's banners back, then settles at once whatever the pill still owed GNOME. */
    destroy() {
        this._injections.clear();
        // clear() leaves GNOME's method behind as the tray's own property; drop it, as before the extension
        const tray = Main.messageTray;
        if (Object.hasOwn(tray, '_showNotification') && tray._showNotification === Object.getPrototypeOf(tray)._showNotification)
            delete tray._showNotification;
        const settles = [...this._pending.values()];
        this._pending.forEach((_settle, id) => GLib.source_remove(id));
        this._pending.clear();
        settles.forEach(settle => settle(false));
        if (settles.length)
            tray._updateState?.();
    }

    /**
     * After a peek ends. One that replaced the banner is treated like a hidden banner: a transient
     * notification goes, and the next queued one gets its turn. Deferred, since peeks start inside
     * GNOME's own queue update; whether the notification is still in use is checked when it runs.
     */
    finish(notification, replacedBanner, destroyed) {
        if (!replacedBanner)
            return;
        let gone = destroyed;
        const destroyId = gone ? 0 : notification.connect('destroy', () => {
            gone = true;
        });
        const settle = updateQueue => {
            if (!gone && destroyId)
                notification.disconnect(destroyId);
            // Updated and queued again, or peeking again: not expired
            const inUse = !notification.acknowledged || this._peeking() === notification ||
                Main.messageTray._notificationQueue?.includes(notification);
            if (!gone && !inUse && notification.isTransient)
                notification.destroy(MessageTray.NotificationDestroyedReason.EXPIRED);
            if (updateQueue)
                Main.messageTray._updateState?.();
        };
        const id = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._pending.delete(id);
            settle(true);
            return GLib.SOURCE_REMOVE;
        });
        this._pending.set(id, settle);
    }
}
