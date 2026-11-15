// Watches MPRIS media players on the session bus and reports the one the island should show.
// Talks to the players through its own small proxies, so it relies on no private GNOME Shell code.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { pickPlayer } from './pick.js';
import { mediaState } from './track.js';

const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';
const MPRIS_PATH = '/org/mpris/MediaPlayer2';
const PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player';
// A player that does not answer a position read within this is skipped until the next read
const POSITION_TIMEOUT_MS = 800;

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
    <method name="Seek">
      <arg type="x" name="Offset" direction="in"/>
    </method>
    <method name="SetPosition">
      <arg type="o" name="TrackId" direction="in"/>
      <arg type="x" name="Position" direction="in"/>
    </method>
    <signal name="Seeked">
      <arg type="x" name="Position"/>
    </signal>
    <property name="PlaybackStatus" type="s" access="read"/>
    <property name="Metadata" type="a{sv}" access="read"/>
    <property name="CanGoNext" type="b" access="read"/>
    <property name="CanGoPrevious" type="b" access="read"/>
    <property name="CanPlay" type="b" access="read"/>
    <property name="CanPause" type="b" access="read"/>
    <property name="CanSeek" type="b" access="read"/>
    <property name="Position" type="x" access="read"/>
  </interface>
</node>`);

const isCancelled = error => error?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);

const logCallError = (busName, method) => error => {
    if (!isCancelled(error))
        console.warn(`island: ${method} on ${busName} failed: ${error.message}`);
};

/**
 * One media player. `app` is resolved once, from DesktopEntry or the player's name.
 * onChange(client) runs on any property change, onSeeked(client, positionUs) when the player jumps.
 */
class MprisClient {
    constructor(busName, resolveApp, onChange, onSeeked) {
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
            this._seekedId = proxy.connectSignal('Seeked', (_proxy, _sender, [position]) => onSeeked(this, position));
            onChange(this);
        }, this._cancellable);
    }

    destroy() {
        this._destroyed = true;
        this._cancellable.cancel();
        if (this._changedId)
            this._player.disconnect(this._changedId);
        if (this._seekedId)
            this._player.disconnectSignal(this._seekedId);
        this._changedId = 0;
        this._seekedId = 0;
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
            canSeek: player?.CanSeek,
            length: read('mpris:length'),
            trackId: read('mpris:trackid'),
        };
    }

    /**
     * The current position in microseconds, or null. Position is not announced by players,
     * so it is read fresh rather than from the proxy's cache.
     */
    fetchPosition(cancellable) {
        return new Promise(resolve => {
            if (!this._player) {
                resolve(null);
                return;
            }
            this._player.call('org.freedesktop.DBus.Properties.Get', new GLib.Variant('(ss)', [PLAYER_IFACE, 'Position']),
                Gio.DBusCallFlags.NONE, POSITION_TIMEOUT_MS, cancellable, (proxy, res) => {
                    try {
                        const [position] = proxy.call_finish(res).recursiveUnpack();
                        resolve(Number.isFinite(position) ? position : null);
                    } catch {
                        // Cancelled, or a player that does not report its position
                        resolve(null);
                    }
                });
        });
    }

    /**
     * Jumps to targetUs: SetPosition when the track has an id, otherwise a relative Seek from a
     * fresh position read, since the last shown position may be stale.
     */
    seekTo(targetUs, trackId) {
        if (!this._player)
            return;
        if (trackId) {
            this._player.SetPositionAsync(trackId, targetUs).catch(logCallError(this.busName, 'SetPosition'));
            return;
        }
        this.fetchPosition(this._cancellable).then(current => {
            if (current !== null && this._player)
                this._player.SeekAsync(targetUs - current).catch(logCallError(this.busName, 'Seek'));
        });
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
 * Calls onSeeked(positionUs) when the shown player jumps to a new position.
 * resolveApp(desktopEntry, identity) returns {name, gicon, activate()} or null.
 */
export class MediaWatcher {
    constructor(onChange, resolveApp, onSeeked) {
        this._onChange = onChange;
        this._onSeeked = onSeeked;
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
        this._onSeeked = null;
    }

    _add(busName) {
        // Replies can arrive after destroy()
        if (!this._clients || this._clients.has(busName))
            return;
        this._clients.set(busName, new MprisClient(busName, this._resolveApp,
            client => this._update(client.busName),
            (client, position) => {
                if (this._clients && client.busName === this._currentId)
                    this._onSeeked?.(position);
            }));
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
