// What the pill shows for a moment when the volume or brightness changes: icon, bar and percent.
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import { levelFraction, levelPercent } from './levels.js';

// Everything in the level view except the bar: 14 px icon, two 8 px gaps, 26 px percent slot
// (.xi-level-icon, .xi-level and .xi-level-value in stylesheet.css)
const FIXED_WIDTH = 14 + 8 + 8 + 26;
const MIN_BAR_WIDTH = 40;

export class LevelView {
    constructor() {
        this._icon = new St.Icon({ style_class: 'xi-level-icon', y_align: Clutter.ActorAlign.CENTER });
        this._fill = new St.Widget({ style_class: 'xi-level-fill', x_align: Clutter.ActorAlign.START });
        this._bar = new St.Widget({
            style_class: 'xi-level-bar',
            layout_manager: new Clutter.BinLayout(),
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._bar.add_child(this._fill);
        this._percent = new St.Label({ style_class: 'xi-level-percent', x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.CENTER });
        // A fixed-width slot, so 9 % and 100 % do not change the pill's width
        const value = new St.Bin({ style_class: 'xi-level-value', child: this._percent });

        this.actor = new St.BoxLayout({ style_class: 'xi-level', visible: false });
        this.actor.add_child(this._icon);
        this.actor.add_child(this._bar);
        this.actor.add_child(value);
    }

    /**
     * Shows {icon, level, maxLevel} from GNOME's pop-up call in `width` pixels, the clock's width, so the
     * pill keeps its size and the meter stays under the pointer. Returns false when there is no level.
     */
    set({ icon, level, maxLevel }, width) {
        const fraction = levelFraction(level, maxLevel);
        if (fraction === null)
            return false;
        if (icon)
            this._icon.gicon = icon;
        const barWidth = Math.max(MIN_BAR_WIDTH, Math.round(width - FIXED_WIDTH));
        this._bar.width = barWidth;
        this._fill.width = Math.round(barWidth * fraction);
        this._percent.text = levelPercent(level);
        return true;
    }
}
