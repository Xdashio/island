// The preferences page. Kept apart from prefs.js so a smoke test can build it without the
// Extensions app (prefs.js imports a module that only exists inside that app).
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { PEEK_MODES } from './peek.js';
import { DEFAULT_ACCENT, MAX_PILL_OPACITY, MIN_PILL_OPACITY, normalizeHex, rgbaToHex } from './theme.js';

export const INTERFACE_SCHEMA = 'org.gnome.desktop.interface';

function switchRow(settings, key, title, subtitle = '') {
    const row = new Adw.SwitchRow({ title, subtitle });
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function spinRow(settings, key, title, subtitle, { lower, upper, step }) {
    const row = new Adw.SpinRow({
        title,
        subtitle,
        adjustment: new Gtk.Adjustment({ lower, upper, step_increment: step, page_increment: step * 5 }),
    });
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

// A colour button kept in step with the accent-color key, plus a reset to Tokyo Night blue
function accentRow(settings, watch) {
    const button = new Gtk.ColorDialogButton({
        dialog: new Gtk.ColorDialog({ title: 'Accent colour', with_alpha: false }),
        valign: Gtk.Align.CENTER,
    });
    const reset = new Gtk.Button({
        icon_name: 'edit-undo-symbolic',
        tooltip_text: 'Back to Tokyo Night blue',
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
    });
    const row = new Adw.ActionRow({
        title: 'Accent colour',
        subtitle: 'Level meter, unread notifications, play button and the open pill border',
        activatable_widget: button,
    });
    row.add_suffix(reset);
    row.add_suffix(button);

    let syncing = false;
    const fromSettings = () => {
        const hex = normalizeHex(settings.get_string('accent-color')) ?? DEFAULT_ACCENT;
        const rgba = new Gdk.RGBA();
        rgba.parse(hex);
        syncing = true;
        button.set_rgba(rgba);
        syncing = false;
        reset.sensitive = hex !== DEFAULT_ACCENT;
    };
    button.connect('notify::rgba', () => {
        if (!syncing)
            settings.set_string('accent-color', rgbaToHex(button.get_rgba()));
    });
    reset.connect('clicked', () => settings.reset('accent-color'));
    watch(settings, 'changed::accent-color', fromSettings);
    fromSettings();
    return row;
}

function lookGroup(settings, watch) {
    const group = new Adw.PreferencesGroup({ title: 'Look' });
    group.add(accentRow(settings, watch));
    group.add(spinRow(settings, 'pill-opacity', 'Pill darkness', 'Percent; lower lets more of the bar show through',
        { lower: MIN_PILL_OPACITY, upper: MAX_PILL_OPACITY, step: 5 }));
    group.add(switchRow(settings, 'show-cover', 'Show the cover', 'On the left of the clock while media plays or is paused'));
    group.add(switchRow(settings, 'show-meter', 'Show the level meter', 'On the right of the clock while media plays'));
    return group;
}

// The card opens from the cover or the meter, so it is greyed out while both are hidden
function cardGroup(settings, watch) {
    const group = new Adw.PreferencesGroup({
        title: 'Media card',
        description: 'The card with the cover, title and controls that drops from the pill. It opens from the cover or the meter, so one of them has to be shown.',
    });
    const syncReachable = () => {
        group.sensitive = settings.get_boolean('show-cover') || settings.get_boolean('show-meter');
    };
    watch(settings, 'changed::show-cover', syncReachable);
    watch(settings, 'changed::show-meter', syncReachable);
    syncReachable();
    group.add(switchRow(settings, 'open-on-hover', 'Open on hover', 'When off, click the cover or the meter to open it'));
    const delay = spinRow(settings, 'hover-delay', 'Hover delay', 'Milliseconds the pointer rests before the card opens',
        { lower: 0, upper: 1000, step: 20 });
    settings.bind('open-on-hover', delay, 'sensitive', Gio.SettingsBindFlags.GET);
    group.add(delay);
    return group;
}

function scrollGroup(settings) {
    const group = new Adw.PreferencesGroup({ title: 'Scrolling' });
    group.add(switchRow(settings, 'scroll-actions', 'Scroll on the cover and the meter',
        'Cover: next or previous track, or ten seconds in a single video. Meter: system volume.'));
    return group;
}

function levelsGroup(settings) {
    const group = new Adw.PreferencesGroup({ title: 'Volume and brightness' });
    group.add(switchRow(settings, 'levels-in-pill', 'Show changes in the pill',
        'Instead of GNOME\'s pop-up, while the top bar is on screen'));
    return group;
}

// Labels in the order of PEEK_MODES
const PEEK_LABELS = ['In the pill, instead of the banner', 'In the pill and as a banner', 'As a banner only'];

function notificationsGroup(settings, watch) {
    const group = new Adw.PreferencesGroup({
        title: 'Notifications',
        description: 'Click the pill while a notification shows to open the list. Critical notifications always keep GNOME\'s banner, and Do Not Disturb keeps the pill quiet too.',
    });
    const row = new Adw.ComboRow({ title: 'Show new notifications', model: Gtk.StringList.new(PEEK_LABELS) });
    const fromSettings = () => {
        row.selected = Math.max(0, PEEK_MODES.indexOf(settings.get_string('notification-peek')));
    };
    row.connect('notify::selected', () => {
        const mode = PEEK_MODES[row.selected];
        if (mode && mode !== settings.get_string('notification-peek'))
            settings.set_string('notification-peek', mode);
    });
    watch(settings, 'changed::notification-peek', fromSettings);
    fromSettings();
    group.add(row);
    return group;
}

function clockGroup(interfaceSettings) {
    const group = new Adw.PreferencesGroup({
        title: 'Clock',
        description: 'GNOME\'s own clock settings, also in GNOME Settings',
    });
    group.add(switchRow(interfaceSettings, 'clock-show-date', 'Show the date'));
    group.add(switchRow(interfaceSettings, 'clock-show-weekday', 'Show the weekday'));
    group.add(switchRow(interfaceSettings, 'clock-show-seconds', 'Show seconds'));
    return group;
}

/**
 * Fills an Adw.PreferencesWindow.
 * @param {Adw.PreferencesWindow} window
 * @param {Gio.Settings} settings the extension's settings
 * @param {Gio.Settings} interfaceSettings org.gnome.desktop.interface
 */
export function buildPreferences(window, settings, interfaceSettings) {
    // Handlers are dropped when the window closes, before its widgets are disposed
    const handlers = [];
    const watch = (source, signal, callback) => handlers.push([source, source.connect(signal, callback)]);
    window.connect('close-request', () => {
        handlers.splice(0).forEach(([source, id]) => source.disconnect(id));
        return false;
    });

    const page = new Adw.PreferencesPage({ title: 'Island', icon_name: 'preferences-desktop-appearance-symbolic' });
    page.add(lookGroup(settings, watch));
    page.add(cardGroup(settings, watch));
    page.add(scrollGroup(settings));
    page.add(levelsGroup(settings));
    page.add(notificationsGroup(settings, watch));
    page.add(clockGroup(interfaceSettings));
    window.add(page);
    window.set_default_size(560, 720);
    // Keeps both settings objects alive as long as the window
    window._islandSettings = [settings, interfaceSettings];
}
