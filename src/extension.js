import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Island } from './lib/island.js';

export default class IslandExtension extends Extension {
    enable() {
        const dateMenu = Main.panel.statusArea.dateMenu;
        // Private fields of GNOME 46's date menu; refuse to touch the bar if they ever change
        if (!dateMenu?._clockDisplay?.get_parent() || !dateMenu._indicator) {
            console.warn('island: the top bar clock is not the GNOME 46 layout, leaving it alone');
            return;
        }
        this._island = new Island(dateMenu, this.getSettings());
    }

    disable() {
        this._island?.destroy();
        this._island = null;
    }
}
