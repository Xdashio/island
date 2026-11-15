// Follows the shown player's position while the card is open. Players do not announce their position,
// so it is read once a second, and only while the card is open and the track is playing.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const POLL_MS = 1000;

export class ProgressTracker {
    /** onPosition(positionUs) runs with every fresh position. */
    constructor(onPosition) {
        this._onPosition = onPosition;
        this._client = null;
        this._playing = false;
        this._key = null;
        this._active = false;
        this._timerId = 0;
        this._cancellable = null;
    }

    /** The player and state to follow; restarts only when the player, track or play state changes. */
    follow(client, state) {
        const key = state ? `${client?.busName}\n${state.id}\n${state.title}\n${state.length}\n${state.playing}` : null;
        if (key === this._key)
            return;
        this._key = key;
        this._client = state ? client : null;
        this._playing = !!state?.playing;
        this._restart();
    }

    /** The card opened. */
    start() {
        this._active = true;
        this._restart();
    }

    /** The card closed. */
    stop() {
        this._active = false;
        this._clear();
    }

    destroy() {
        this.stop();
        this._client = null;
        this._onPosition = null;
    }

    /** After a seek: drops the read in flight and waits a full interval, so an old position cannot pull the bar back. */
    deferRead() {
        this._restart(false);
    }

    _restart(readNow = true) {
        this._clear();
        if (!this._active || !this._client)
            return;
        if (readNow)
            this._fetch();
        if (this._playing) {
            this._timerId = GLib.timeout_add(GLib.PRIORITY_LOW, POLL_MS, () => {
                this._fetch();
                return GLib.SOURCE_CONTINUE;
            });
        }
    }

    _clear() {
        if (this._timerId)
            GLib.source_remove(this._timerId);
        this._timerId = 0;
        this._cancellable?.cancel();
        this._cancellable = null;
    }

    async _fetch() {
        // A slow answer to the previous read is dropped
        this._cancellable?.cancel();
        const cancellable = this._cancellable = new Gio.Cancellable();
        const position = await this._client.fetchPosition(cancellable);
        if (!cancellable.is_cancelled() && position !== null)
            this._onPosition?.(position);
    }
}
