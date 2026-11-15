// Loads the generated override stylesheet (theme.js) into the shell's theme and swaps it on change.
// GNOME carries extension stylesheets over when the shell theme changes (Night Theme Switcher at
// sunrise and sunset), so the override survives a light or dark switch.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

// Settings change in bursts while a slider is dragged; restyling the shell once per burst is enough
const DEBOUNCE_MS = 150;
const FILE_NAME = 'island-xdashio-theme.css';

const currentTheme = () => St.ThemeContext.get_for_stage(global.stage).get_theme();

export class ThemeOverride {
    constructor() {
        this._file = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_runtime_dir(), FILE_NAME]));
        this._loaded = false;
        this._pendingCss = null;
        this._timerId = 0;
    }

    /** Applies css now. */
    apply(css) {
        this._unload();
        try {
            this._file.replace_contents(new TextEncoder().encode(css), null, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            currentTheme().load_stylesheet(this._file);
            this._loaded = true;
        } catch (error) {
            console.warn(`island: could not apply the theme settings: ${error.message}`);
        }
    }

    /** Applies css once settings stop changing for a moment. */
    schedule(css) {
        this._pendingCss = css;
        if (this._timerId)
            return;
        this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DEBOUNCE_MS, () => {
            this._timerId = 0;
            this.apply(this._pendingCss);
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        if (this._timerId)
            GLib.source_remove(this._timerId);
        this._timerId = 0;
        this._unload();
        try {
            this._file.delete(null);
        } catch {
            // Already gone
        }
    }

    // Never throws: at shell teardown the theme may already be gone, and cleanup must go on
    _unload() {
        if (!this._loaded)
            return;
        this._loaded = false;
        try {
            currentTheme().unload_stylesheet(this._file);
        } catch (error) {
            console.warn(`island: could not unload the theme settings: ${error.message}`);
        }
    }
}
