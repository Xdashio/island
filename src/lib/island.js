// Ties the pill, the media card and the player watcher together, and opens the card on hover or click.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { loadArt } from './art.js';
import { MediaCard } from './card.js';
import { cardPosition } from './geometry.js';
import { MediaWatcher } from './media.js';
import { IslandPill } from './pill.js';

// Hover intent: a pointer passing over the pill does not open the card, a short exit does not close it
const OPEN_DELAY_MS = 140;
const CLOSE_DELAY_MS = 260;

// Browsers send no DesktopEntry, so their app is found by the player's name ("Brave")
function resolveApp(desktopEntry, identity) {
    const appSystem = Shell.AppSystem.get_default();
    let id = null;
    if (desktopEntry)
        id = `${desktopEntry}.desktop`;
    else if (identity)
        id = Shell.AppSystem.search(identity)?.[0]?.[0] ?? null;
    const app = id ? appSystem.lookup_app(id) : null;
    if (!app)
        return identity ? { name: identity, gicon: null, activate: null } : null;
    return { name: app.get_name(), gicon: app.get_icon(), activate: () => app.activate() };
}

export class Island {
    constructor(dateMenu) {
        this._dateMenu = dateMenu;
        this._state = null;
        this._client = null;
        this._artKey = null;
        this._artFallback = null;
        this._artCancellable = null;
        this._timerId = 0;

        this._pill = new IslandPill(dateMenu);
        this._card = new MediaCard({
            onRaise: () => {
                this._client?.raise();
                this._closeCard();
            },
            onPrevious: () => this._client?.previous(),
            onPlayPause: () => this._client?.playPause(),
            onNext: () => this._client?.next(),
        });

        for (const actor of [this._pill.art, this._pill.meter, this._card.actor])
            actor.connect('notify::hover', () => this._onHoverChanged());
        for (const button of [this._pill.art, this._pill.meter])
            button.connect('clicked', (_button, clickedButton) => this._onPillClicked(clickedButton));
        // The calendar and the card would overlap
        dateMenu.menu.connectObject('open-state-changed', (_menu, open) => {
            if (open)
                this._closeCard();
        }, this);
        Main.overview.connectObject('showing', () => this._closeCard(), this);

        this._watcher = new MediaWatcher((state, client) => this._onMedia(state, client), resolveApp);
    }

    destroy() {
        this._clearTimer();
        this._artCancellable?.cancel();
        this._watcher.destroy();
        this._dateMenu.menu.disconnectObject(this);
        Main.overview.disconnectObject(this);
        this._card.destroy();
        this._pill.destroy();
    }

    _onMedia(state, client) {
        this._state = state;
        this._client = client;
        this._pill.setMedia(state);
        this._card.update(state);
        if (!state)
            this._closeCard();
        this._setArt(state, client?.app?.gicon ?? null);
    }

    // Keyed by track as well as URL: Chromium reuses one cover file for every track
    _setArt(state, fallbackGicon) {
        const url = state?.artUrl ?? '';
        const key = `${state?.id}\n${state?.title}\n${state?.subtitle}\n${url}`;
        if (key === this._artKey && fallbackGicon === this._artFallback)
            return;
        this._artKey = key;
        this._artFallback = fallbackGicon;
        this._artCancellable?.cancel();
        const cancellable = this._artCancellable = new Gio.Cancellable();
        loadArt(url, cancellable, uri => {
            this._pill.cover.set(uri, fallbackGicon);
            this._card.cover.set(uri, fallbackGicon);
        });
    }

    _clearTimer() {
        if (this._timerId)
            GLib.source_remove(this._timerId);
        this._timerId = 0;
    }

    _later(delay, callback) {
        this._clearTimer();
        this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._timerId = 0;
            callback();
            return GLib.SOURCE_REMOVE;
        });
    }

    _onHoverChanged() {
        const hovered = this._pill.art.hover || this._pill.meter.hover || this._card.actor.hover;
        if (hovered === this._card.isOpen) {
            this._clearTimer();
            return;
        }
        this._later(hovered ? OPEN_DELAY_MS : CLOSE_DELAY_MS, () => (hovered ? this._openCard() : this._closeCard()));
    }

    // Left click opens the card, or the player once the card is open (hover usually opens it first);
    // middle click plays or pauses; right click does nothing
    _onPillClicked(clickedButton) {
        this._clearTimer();
        if (clickedButton === Clutter.BUTTON_MIDDLE) {
            this._client?.playPause();
            return;
        }
        if (clickedButton !== Clutter.BUTTON_PRIMARY)
            return;
        if (!this._card.isOpen) {
            this._openCard();
            return;
        }
        this._client?.raise();
        this._closeCard();
    }

    _openCard() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!this._state || !monitor || this._dateMenu.menu.isOpen || Main.overview.visible)
            return;
        const [anchorX] = this._pill.actor.get_transformed_position();
        const [anchorWidth] = this._pill.actor.get_transformed_size();
        const [, panelY] = Main.panel.get_transformed_position();
        this._card.open(cardPosition({
            anchorX,
            anchorWidth,
            top: panelY + Main.panel.height,
            cardWidth: this._card.width,
            monitorX: monitor.x,
            monitorWidth: monitor.width,
        }));
    }

    _closeCard() {
        this._clearTimer();
        this._card.close();
    }
}
