import Gio from 'gi://Gio';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { buildPreferences, INTERFACE_SCHEMA } from './lib/prefs-page.js';

export default class IslandPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        buildPreferences(window, this.getSettings(), new Gio.Settings({ schema_id: INTERFACE_SCHEMA }));
    }
}
