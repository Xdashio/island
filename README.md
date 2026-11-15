# Island

A light, fitted top bar island for GNOME Shell 46. It turns the clock into a slim pill that sits inside the bar, shows what is playing, and drops a small card with media controls when you hover over it.

It is tuned for the WhiteSur shell theme (28 px bar) and for low-end graphics such as Intel HD 3000: nothing animates every frame and nothing runs in the background when nothing is playing.

## Features

- **Fitted clock pill.** GNOME's own clock in a 22 px pill, centred both ways in the 28 px bar with 3 px of air above and below and even padding. Digits are tabular, so a clock with seconds does not make the pill jiggle. Clicking the clock still opens the calendar and notifications.
- **Tokyo Night look.** A translucent dark fill (`#1a1b26`) with a `#7aa2f7` accent and a hairline border. WhiteSur keeps white bar text in light and dark mode, so the pill is the same in both.
- **Now playing.** While a player (Brave, Firefox, VLC, Rhythmbox, any MPRIS app) has a track, its cover sits on the left of the clock and a three-bar level meter on the right. The cover and meter go grey when paused.
- **Media card.** Hover over the cover or the meter to drop a card with the cover, title, artist, app, a progress bar with elapsed and remaining time, and previous, play or pause, and next buttons. Drag or click the bar to jump; arrow keys and scrolling on it work too.
- **Notifications.** GNOME's indicator stays inside the pill: unread notifications show in the accent colour, Do Not Disturb shows a grey bell.
- **Settings panel.** Accent colour, pill darkness, which parts show, how the card opens, and GNOME's clock options in one place.

| On the cover or meter | Does |
|---|---|
| Hover | Opens the media card |
| Left click | Opens the card, or brings the player to the front when the card is open |
| Middle click | Play or pause |
| Click the title in the card | Brings the player to the front |
| Drag, click or scroll the progress bar | Jumps to that point in the track |

## Requirements

- GNOME Shell 46. Developed on Zorin OS 18 (X11). Nothing in it is X11-specific.
- Looks best with the [WhiteSur](https://github.com/vinceliuice/WhiteSur-gtk-theme) shell theme or any theme with a 28 px top bar.

## Install

From source:

```bash
git clone https://github.com/Xdashio/island.git
cd island
scripts/install.sh
gnome-extensions enable island@xdashio
```

Then reload GNOME Shell. On X11 press Alt+F2, type `r` and press Enter. On Wayland log out and back in.

As a zip:

```bash
npm run pack
gnome-extensions install --force dist/island@xdashio.shell-extension.zip
```

If another extension also changes the clock (for example another "dynamic island"), disable it first.

## Settings

Open them from the Extensions app, or with:

```bash
gnome-extensions prefs island@xdashio
```

| Setting | Default | What it does |
|---|---|---|
| Accent colour | Tokyo Night blue `#7aa2f7` | Level meter, unread notifications, play button and the open pill border. The undo button goes back to the default. |
| Pill darkness | 62 % | How opaque the pill is; lower lets more of the bar show through. Hover and the open calendar darken it a little more. |
| Show the cover | On | The cover on the left of the clock. |
| Show the level meter | On | The meter on the right of the clock. |
| Open on hover | On | Off means the card opens only with a click. |
| Hover delay | 140 ms | How long the pointer rests before the card opens. |
| Show the date, weekday, seconds | GNOME's | GNOME's own clock options, the same ones as in GNOME Settings. |

Changes apply straight away, without reloading the shell.

## Customize further

Sizes, spacing and the rest of the look are in [`src/stylesheet.css`](src/stylesheet.css): the pill is `.xi-pill` and the card is `.xi-card`. The accent colour and pill darkness come from the settings through [`src/lib/theme.js`](src/lib/theme.js), which writes a small override stylesheet with the same selectors. Edit, run `scripts/install.sh`, and reload the shell.

## Uninstall

```bash
gnome-extensions disable island@xdashio
rm -r ~/.local/share/gnome-shell/extensions/island@xdashio ~/.cache/island-xdashio
dconf reset -f /org/gnome/shell/extensions/island/
```

The clock goes back to normal as soon as the extension is disabled.

## Safety and performance

- **Covers come only from local files.** The cover is checked first: a regular file (symlinks are not followed), at most 4 MiB, and a PNG, JPEG, GIF, WebP or BMP header of at most 2048 px a side. Then it is shrunk to a 96 px copy in `~/.cache/island-xdashio`, and that copy is what the shell displays. A huge image, `/dev/zero`, a FIFO or a broken file shows the app icon instead and cannot freeze the shell. The cache keeps the newest 40 covers.
- **No network.** Web covers (Spotify sends `https://` covers) are never downloaded; those players show their app icon.
- **No background work when idle.** The meter steps about six times a second only while something plays and the bar is visible. The players are watched through D-Bus signals; the only polling is one position read a second, while the card is open and the track is playing.

## Development

```text
src/
  extension.js        enable and disable
  prefs.js            the settings window (Extensions app)
  stylesheet.css      the whole look
  schemas/            the settings schema
  lib/island.js       ties pill, card, player watcher and settings together; hover and click
  lib/pill.js         wraps GNOME's clock in the pill; cover and meter
  lib/card.js         the media card
  lib/media.js        MPRIS players over D-Bus
  lib/art.js          safe cover loading and the cover cache
  lib/seekbar.js      the card's progress bar (GNOME's slider)
  lib/tracker.js      reads the position while the card is open
  lib/pick.js         which player to show (pure)
  lib/track.js        what to show for a player (pure)
  lib/geometry.js     card placement, meter levels, image checks (pure)
  lib/theme.js        accent and pill darkness to an override stylesheet (pure)
  lib/progress.js     time labels, bar position and seek targets (pure)
  lib/style.js        loads that override into the shell's theme
  lib/prefs-page.js   the settings page, built so it can be tested outside the Extensions app
tests/                node --test unit tests for the pure modules
tests/smoke/          gjs smoke tests: cover loading with hostile inputs, and every settings row
```

```bash
npm run check      # syntax check
npm test           # unit tests
npm run coverage   # unit tests with coverage
npm run smoke      # smoke tests (needs gjs, GTK 4 and libadwaita; use xvfb-run without a display)
npm run pack       # build dist/island@xdashio.shell-extension.zip
```

GitHub Actions runs all of these except `pack` on every push.

The pill relies on two private fields of GNOME 46's date menu (`_clockDisplay` and `_indicator`). If a future GNOME changes them, the extension leaves the bar alone and logs a warning instead of breaking it.

## Credits

The rule for choosing which player to show (playing beats paused, the last player to start playing takes over) is adapted from [Dynamic Island](https://github.com/basskibo/linux_dynamic_island) by basskibo.

## License

GPL-2.0-or-later. See [LICENSE](LICENSE) and the [changelog](CHANGELOG.md).
