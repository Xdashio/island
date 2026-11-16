// Builds the preferences page with real GTK and libadwaita and checks every row is bound both ways.
// Run with scripts/smoke.sh: it compiles the schema into a throwaway folder and sets
// GSETTINGS_BACKEND=memory, so no real setting is ever written. The window is never shown.
import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import System from 'system';

import { buildPreferences, INTERFACE_SCHEMA } from '../../src/lib/prefs-page.js';

if (GLib.getenv('GSETTINGS_BACKEND') !== 'memory') {
    printerr('Refusing to run: set GSETTINGS_BACKEND=memory (scripts/smoke.sh does) so real settings stay untouched.');
    System.exit(2);
}

Gtk.init();
Adw.init();

const source = Gio.SettingsSchemaSource.new_from_directory(
    GLib.getenv('ISLAND_SCHEMA_DIR'), Gio.SettingsSchemaSource.get_default(), false);
const settings = new Gio.Settings({ settings_schema: source.lookup('org.gnome.shell.extensions.island', false) });
const iface = new Gio.Settings({ schema_id: INTERFACE_SCHEMA });

const window = new Adw.PreferencesWindow();
buildPreferences(window, settings, iface);

function* walk(widget) {
    yield widget;
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling())
        yield* walk(child);
}
const widgets = [...walk(window)];
const row = title => widgets.find(w => w instanceof Adw.PreferencesRow && w.title === title);
const inRow = (title, type) => [...walk(row(title))].filter(w => w instanceof type);

let failures = 0;
const check = (name, ok) => {
    failures += ok ? 0 : 1;
    print(`${ok ? 'ok' : 'FAIL'}: ${name}`);
};

const titles = ['Accent colour', 'Pill darkness', 'Show the cover', 'Show the level meter', 'Open on hover',
    'Hover delay', 'Scroll on the cover and the meter', 'Show changes in the pill',
    'Show the date', 'Show the weekday', 'Show seconds'];
check('every row is on the page', titles.every(t => row(t)));

settings.set_boolean('show-meter', false);
check('a switch follows its setting', row('Show the level meter').active === false);
row('Show the level meter').active = true;
check('a setting follows its switch', settings.get_boolean('show-meter') === true);

settings.set_boolean('scroll-actions', false);
check('the scroll switch follows its setting', row('Scroll on the cover and the meter').active === false);
row('Scroll on the cover and the meter').active = true;
check('the scroll switch writes its setting', settings.get_boolean('scroll-actions') === true);

settings.set_boolean('levels-in-pill', false);
check('the level switch follows its setting', row('Show changes in the pill').active === false);
row('Show changes in the pill').active = true;
check('the level switch writes its setting', settings.get_boolean('levels-in-pill') === true);

row('Pill darkness').value = 80;
check('pill darkness writes the setting', settings.get_int('pill-opacity') === 80);
settings.set_int('hover-delay', 300);
check('hover delay follows its setting', row('Hover delay').value === 300);

settings.set_boolean('open-on-hover', false);
check('hover delay greys out when hover is off', row('Hover delay').sensitive === false);
settings.set_boolean('open-on-hover', true);

const cardRows = () => row('Open on hover').get_ancestor(Adw.PreferencesGroup);
settings.set_boolean('show-cover', false);
check('the card settings stay usable with only the meter shown', cardRows().sensitive === true);
settings.set_boolean('show-meter', false);
check('the card settings grey out when nothing can open the card', cardRows().sensitive === false);
settings.set_boolean('show-cover', true);
check('the card settings come back with the cover', cardRows().sensitive === true);

const [colorButton] = inRow('Accent colour', Gtk.ColorDialogButton);
const [resetButton] = inRow('Accent colour', Gtk.Button).filter(b => b.icon_name === 'edit-undo-symbolic');
settings.set_string('accent-color', '#bb9af7');
check('the colour button follows the setting', colorButton.get_rgba().to_string() === 'rgb(187,154,247)');
check('reset is offered for a custom colour', resetButton.sensitive === true);
const picked = new Gdk.RGBA();
picked.parse('#9ece6a');
colorButton.set_rgba(picked);
check('picking a colour writes the setting', settings.get_string('accent-color') === '#9ece6a');
resetButton.emit('clicked');
check('reset goes back to Tokyo Night blue', settings.get_string('accent-color') === '#7aa2f7');
check('reset is greyed out for the default colour', resetButton.sensitive === false);

iface.set_boolean('clock-show-seconds', false);
check('the clock rows follow GNOME settings', row('Show seconds').active === false);
row('Show seconds').active = true;
check('the clock rows write GNOME settings', iface.get_boolean('clock-show-seconds') === true);

// close() does nothing on a window that was never shown, so send the request it would send
window.emit('close-request');
settings.set_string('accent-color', '#ff9e64');
check('closing the window stops it following settings', colorButton.get_rgba().to_string() === 'rgb(122,162,247)');
window.destroy();
print(failures ? `${failures} prefs check(s) failed` : 'all prefs checks passed');
System.exit(failures ? 1 : 0);
