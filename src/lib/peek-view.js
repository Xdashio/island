// What the pill shows for a moment when a notification arrives: the app's icon, the title and the body.
// It takes the clock's place, widening the pill up to a limit; a click opens GNOME's notification list.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import St from 'gi://St';

const FALLBACK_ICON = 'preferences-system-notifications-symbolic';

const ellipsized = styleClass => {
    const label = new St.Label({ style_class: styleClass, y_align: Clutter.ActorAlign.CENTER });
    label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return label;
};

export class PeekView {
    constructor() {
        this._icon = new St.Icon({ style_class: 'xi-peek-icon', y_align: Clutter.ActorAlign.CENTER });
        this._title = ellipsized('xi-peek-title');
        this._body = ellipsized('xi-peek-body');
        this.actor = new St.BoxLayout({ style_class: 'xi-peek', visible: false });
        this.actor.add_child(this._icon);
        this.actor.add_child(this._title);
        this.actor.add_child(this._body);
    }

    /** {gicon, title, body} from peekText(); minWidth keeps the pill from shrinking below the clock. */
    set({ gicon, title, body }, minWidth) {
        this._icon.gicon = gicon ?? new Gio.ThemedIcon({ name: FALLBACK_ICON });
        this._title.text = title;
        this._body.text = body;
        this._body.visible = body !== '';
        this.actor.min_width = minWidth;
    }
}
