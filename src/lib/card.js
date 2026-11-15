// The card that drops from the pill: cover, title, artist, app, progress and media controls.
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Cover } from './pill.js';
import { SeekBar } from './seekbar.js';

const OPEN_MS = 160;
const CLOSE_MS = 120;
const SLIDE_PX = 6;

const ellipsized = styleClass => {
    const label = new St.Label({ style_class: styleClass });
    label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return label;
};

export class MediaCard {
    /** handlers: {onRaise, onPrevious, onPlayPause, onNext, onSeek, onDragEnd} */
    constructor(handlers) {
        this._open = false;

        this.cover = new Cover('xi-card-art', 'xi-card-art-icon');
        this._app = ellipsized('xi-card-app');
        this._title = ellipsized('xi-card-title');
        this._subtitle = ellipsized('xi-card-subtitle');
        const text = new St.BoxLayout({
            style_class: 'xi-card-text',
            vertical: true,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        [this._app, this._title, this._subtitle].forEach(label => text.add_child(label));

        const row = new St.BoxLayout({ style_class: 'xi-card-row' });
        row.add_child(this.cover.actor);
        row.add_child(text);
        const head = new St.Button({ style_class: 'xi-card-head', child: row, accessible_name: 'Open player', x_expand: true });
        head.connect('clicked', () => handlers.onRaise());

        this._previous = this._control('media-skip-backward-symbolic', 'Previous', handlers.onPrevious);
        this._playPause = this._control('media-playback-start-symbolic', 'Play or pause', handlers.onPlayPause);
        this._playPause.add_style_class_name('xi-control-play');
        this._next = this._control('media-skip-forward-symbolic', 'Next', handlers.onNext);
        this._seekBar = new SeekBar({ onSeek: handlers.onSeek, onDragEnd: handlers.onDragEnd });
        const controls = new St.BoxLayout({ style_class: 'xi-card-controls', x_align: Clutter.ActorAlign.CENTER });
        [this._previous, this._playPause, this._next].forEach(button => controls.add_child(button));

        this.actor = new St.BoxLayout({
            style_class: 'xi-card',
            vertical: true,
            reactive: true,
            track_hover: true,
            visible: false,
            opacity: 0,
        });
        this.actor.add_child(head);
        this.actor.add_child(this._seekBar.actor);
        this.actor.add_child(controls);
        Main.layoutManager.addTopChrome(this.actor);
    }

    get isOpen() {
        return this._open;
    }

    /** True while the progress bar is being dragged, so the card stays open past its edge. */
    get isDragging() {
        return this._seekBar.isDragging;
    }

    setPosition(positionUs) {
        this._seekBar.setPosition(positionUs);
    }

    destroy() {
        this._seekBar.destroy();
        this.actor.remove_all_transitions();
        Main.layoutManager.removeChrome(this.actor);
        this.actor.destroy();
    }

    _control(iconName, name, onClick) {
        const button = new St.Button({
            style_class: 'xi-control',
            child: new St.Icon({ icon_name: iconName }),
            accessible_name: name,
            can_focus: true,
        });
        button.connect('clicked', () => onClick());
        return button;
    }

    /** state from mediaState(); null leaves the last track on screen while the card closes. */
    update(state) {
        if (!state)
            return;
        this._app.text = state.appName;
        this._app.visible = state.appName !== '';
        this._title.text = state.title;
        this._subtitle.text = state.subtitle;
        this._subtitle.visible = state.subtitle !== '';
        this._previous.reactive = state.canGoPrevious;
        this._next.reactive = state.canGoNext;
        this._playPause.reactive = state.canPlayPause;
        this._playPause.child.icon_name = state.playing ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
        this._seekBar.setTrack(state.length, state.canSeek);
    }

    /** Preferred width, for centring under the pill before it is shown. */
    get width() {
        return this.actor.get_preferred_width(-1)[1];
    }

    open({ x, y }) {
        this._open = true;
        this.actor.set_position(x, y);
        this.actor.remove_all_transitions();
        this.actor.show();
        this.actor.translation_y = -SLIDE_PX;
        this.actor.ease({
            opacity: 255,
            translation_y: 0,
            duration: OPEN_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    close() {
        this._seekBar.cancelDrag();
        if (!this._open)
            return;
        this._open = false;
        this.actor.ease({
            opacity: 0,
            translation_y: -SLIDE_PX,
            duration: CLOSE_MS,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: () => this.actor.hide(),
        });
    }
}
