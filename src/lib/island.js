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
import { ThemeOverride } from './style.js';
import { themeCss } from './theme.js';

// Hover intent: a short exit does not close the card. The open delay is a setting (hover-delay).
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
    constructor(dateMenu, settings) {
        this._dateMenu = dateMenu;
        this._settings = settings;
        this._state = null;
        this._client = null;
        this._artKey = null;
        this._artFallback = null;
        this._artCancellable = null;
        this._timerId = 0;

        this._pill = new IslandPill(dateMenu);
        this._pill.setParts(this._parts());
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
        settings.connectObject('changed', (_settings, key) => this._onSettingChanged(key), this);

        this._watcher = new MediaWatcher((state, client) => this._onMedia(state, client), resolveApp);
        // Last, so a failure above never leaves the override stylesheet loaded
        this._theme = new ThemeOverride();
        this._theme.apply(this._themeCss());
    }

    destroy() {
        this._clearTimer();
        this._artCancellable?.cancel();
        this._watcher.destroy();
        this._settings.disconnectObject(this);
        this._dateMenu.menu.disconnectObject(this);
        Main.overview.disconnectObject(this);
        this._card.destroy();
        this._pill.destroy();
        this._theme.destroy();
    }

    _themeCss() {
        return themeCss({
            accent: this._settings.get_string('accent-color'),
            pillOpacity: this._settings.get_int('pill-opacity'),
        });
    }

    _parts() {
        return {
            cover: this._settings.get_boolean('show-cover'),
            meter: this._settings.get_boolean('show-meter'),
        };
    }

    _onSettingChanged(key) {
        switch (key) {
        case 'accent-color':
        case 'pill-opacity':
            this._theme.schedule(this._themeCss());
            break;
        case 'show-cover':
        case 'show-meter':
            this._clearTimer();
            this._pill.setParts(this._parts());
            break;
        case 'open-on-hover':
            this._clearTimer();
            break;
        default:
            // hover-delay is read when the pointer arrives
        }
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
        if (hovered === this._card.isOpen || (hovered && !this._settings.get_boolean('open-on-hover'))) {
            this._clearTimer();
            return;
        }
        if (hovered)
            this._later(this._settings.get_int('hover-delay'), () => this._openCard());
        else
            this._later(CLOSE_DELAY_MS, () => this._closeCard());
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
