// Sends GNOME's volume and brightness pop-ups to the pill. Every one of them, from the media keys,
// brightness keys or the speaker icon, goes through Main.osdWindowManager.show(); that method is
// overridden with GNOME's InjectionManager and restored exactly on disable.
import { InjectionManager } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { takesOsd } from './levels.js';

export class OsdBridge {
    /**
     * enabled() says whether the setting is on; onLevel({icon, level, maxLevel}) shows one in the pill.
     */
    constructor(enabled, onLevel) {
        this._injections = new InjectionManager();
        this._injections.overrideMethod(Main.osdWindowManager, 'show', original => {
            return function (monitorIndex, icon, label, level, maxLevel) {
                const taken = takesOsd({
                    enabled: enabled(),
                    monitorIndex,
                    primaryIndex: Main.layoutManager.primaryIndex,
                    level,
                    fullscreen: !!Main.layoutManager.primaryMonitor?.inFullscreen,
                });
                if (!taken)
                    return original.call(this, monitorIndex, icon, label, level, maxLevel);
                // A GNOME pop-up already on screen would otherwise linger beside the pill
                this.hideAll();
                return onLevel({ icon, level, maxLevel });
            };
        });
    }

    destroy() {
        this._injections.clear();
        // clear() leaves GNOME's method behind as the manager's own property; drop it so the
        // manager reads its class method again, as before the extension
        const manager = Main.osdWindowManager;
        if (Object.hasOwn(manager, 'show') && manager.show === Object.getPrototypeOf(manager).show)
            delete manager.show;
    }
}
