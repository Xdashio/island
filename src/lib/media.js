// Watches MPRIS media players on the session bus and reports the one the island should show.
// Talks to the players through its own small proxies, so it relies on no private GNOME Shell code.
import Gio from 'gi://Gio';

import { pickPlayer } from './pick.js';
import { mediaState } from './track.js';

const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';
const MPRIS_PATH = '/org/mpris/MediaPlayer2';

const MprisProxy = Gio.DBusProxy.makeProxyWrapper(`<node>
  <interface name="org.mpris.MediaPlayer2">
    <method name="Raise"/>
    <property name="CanRaise" type="b" access="read"/>
    <property name="Identity" type="s" access="read"/>
    <property name="DesktopEntry" type="s" access="read"/>
  </interface>
</node>`);

const PlayerProxy = Gio.DBusProxy.makeProxyWrapper(`<node>
  <interface name="org.mpris.MediaPlayer2.Player">
    <method name="PlayPause"/>
    <method name="Next"/>
    <method name="Previous"/>
    <property name="PlaybackStatus" type="s" access="read"/>
    <property name="Metadata" type="a{sv}" access="read"/>
    <property name="CanGoNext" type="b" access="read"/>
    <property name="CanGoPrevious" type="b" access="read"/>
    <property name="CanPlay" type="b" access="read"/>
    <property name="CanPause" type="b" access="read"/>
  </interface>
</node>`);

const isCancelled = error => error?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);

const logCallError = (busName, method) => error => {
    if (!isCancelled(error))
        console.warn(`island: ${method} on ${busName} failed: ${error.message}`);
};

/** One media player. `app` is resolved once, from DesktopEntry or the player's name. */
class MprisClient {
    constructor(busName, resolveApp, onChange) {
        this.busName = busName;
        this.app = null;
        this._mpris = null;
        this._player = null;
        this._destroyed = false;
        this._cancellable = new Gio.Cancellable();

        // A proxy can finish connecting after destroy(); its callback must then do nothing
        new MprisProxy(Gio.DBus.session, busName, MPRIS_PATH, (proxy, error) => {
            if (this._destroyed)
                return;
            if (error) {
                logCallError(busName, 'connect')(error);
                return;
            }
            this._mpris = proxy;
            this.app = resolveApp(proxy.DesktopEntry ?? '', proxy.Identity ?? '');
            onChange(this);
        }, this._cancellable);

        new PlayerProxy(Gio.DBus.session, busName, MPRIS_PATH, (proxy, error) => {
            if (this._destroyed)
                return;
            if (error) {
                logCallError(busName, 'connect')(error);
                return;
            }
            this._player = proxy;
            this._changedId = proxy.connect('g-properties-changed', () => onChange(this));
            onChange(this);
        }, this._cancellable);
    }

    destroy() {
        this._destroyed = true;
        this._cancellable.cancel();
        if (this._changedId)
            this._player.disconnect(this._changedId);
        this._changedId = 0;
        this._player = null;
        this._mpris = null;
    }

    /** Raw values for the pure helpers in pick.js and track.js. */
    snapshot() {
        const player = this._player;
        const metadata = player?.Metadata ?? {};
        const read = key => {
            try {
                return metadata[key]?.deepUnpack();
            } catch {
                return undefined;
            }
        };
        return {
            id: this.busName,
            busName: this.busName,
            status: player?.PlaybackStatus ?? null,
            rawTitle: read('xesam:title'),
            artists: read('xesam:artist'),
            artUrl: read('mpris:artUrl'),
            canGoNext: player?.CanGoNext,
            canGoPrevious: player?.CanGoPrevious,
            canPlay: player?.CanPlay,
            canPause: player?.CanPause,
        };
    }

    playPause() {
        this._player?.PlayPauseAsync().catch(logCallError(this.busName, 'PlayPause'));
    }

    next() {
        this._player?.NextAsync().catch(logCallError(this.busName, 'Next'));
    }

    previous() {
        this._player?.PreviousAsync().catch(logCallError(this.busName, 'Previous'));
    }

    // Activating the app beats Raise(), which focus stealing prevention often blocks
    raise() {
        if (this.app?.activate)
            this.app.activate();
        else if (this._mpris?.CanRaise)
            this._mpris.RaiseAsync().catch(logCallError(this.busName, 'Raise'));
    }
}

/**
 * Calls onChange(state, client) whenever the shown player or its track changes;
 * state comes from mediaState() and is null when nothing should show.
 * resolveApp(desktopEntry, identity) returns {name, gicon, activate()} or null.
 */
export class MediaWatcher {
    constructor(onChange, resolveApp) {
        this._onChange = onChange;
        this._resolveApp = resolveApp;
        this._clients = new Map();
        this._currentId = null;
        this._cancellable = new Gio.Cancellable();

        // A namespace match must not end with '.'
        this._nameOwnerId = Gio.DBus.session.signal_subscribe('org.freedesktop.DBus', 'org.freedesktop.DBus',
            'NameOwnerChanged', '/org/freedesktop/DBus', 'org.mpris.MediaPlayer2',
            Gio.DBusSignalFlags.MATCH_ARG0_NAMESPACE, (_conn, _sender, _path, _iface, _signal, params) => {
                const [name, oldOwner, newOwner] = params.deepUnpack();
                if (oldOwner)
                    this._remove(name);
                if (newOwner)
                    this._add(name);
            });

        Gio.DBus.session.call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
            'ListNames', null, null, Gio.DBusCallFlags.NONE, -1, this._cancellable, (conn, res) => {
                try {
                    const [names] = conn.call_finish(res).deepUnpack();
                    names.filter(n => n.startsWith(MPRIS_PREFIX)).forEach(n => this._add(n));
                } catch (error) {
                    logCallError('the session bus', 'ListNames')(error);
                }
            });
    }

    destroy() {
        this._cancellable.cancel();
        Gio.DBus.session.signal_unsubscribe(this._nameOwnerId);
        this._clients.forEach(client => client.destroy());
        this._clients = null;
        this._onChange = null;
    }

    _add(busName) {
        // Replies can arrive after destroy()
        if (!this._clients || this._clients.has(busName))
            return;
        this._clients.set(busName, new MprisClient(busName, this._resolveApp, client => this._update(client.busName)));
    }

    _remove(busName) {
        const client = this._clients?.get(busName);
        if (!client)
            return;
        this._clients.delete(busName);
        client.destroy();
        this._update(null);
    }

    _update(changedId) {
        if (!this._clients)
            return;
        const snapshots = [...this._clients.values()].map(client => client.snapshot());
        this._currentId = pickPlayer(snapshots, this._currentId, changedId);
        const client = this._clients.get(this._currentId) ?? null;
        const state = client ? mediaState(client.snapshot(), client.app?.name ?? '') : null;
        this._onChange(state, client);
    }
}
