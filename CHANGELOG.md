# Changelog

## 1.5.0 (2026-11-16)

- Notification peek: a new notification shows in the pill for four seconds (app icon, title and first line) instead of GNOME's banner. Click it to open the notification list.
- It follows GNOME's own rules: nothing in Do Not Disturb or for low urgency, GNOME's banner in fullscreen, and critical notifications keep the banner as well.
- A setting to show notifications in the pill and as a banner, or as a banner only.

## 1.4.0 (2026-11-16)

- Volume and brightness changes show in the pill, in place of the clock for a moment, instead of GNOME's pop-up: an icon, a bar in the accent colour and the percent. In fullscreen, GNOME's pop-up is used, since the bar is hidden.
- Scrolling on the meter now changes the volume through GNOME's shared sound mixer and shows the level the same way.
- A setting to keep GNOME's pop-up instead.

## 1.3.1 (2026-11-15)

- Drop `background-position: center` from the cover styles. GNOME's style engine does not support it and logged a warning each time a cover was drawn; covers stay centred, since St centres them by default.

## 1.3.0 (2026-11-15)

- Scroll on the cover to go to the next or previous track. In a single video that cannot skip (a YouTube video, for example) it jumps ten seconds instead. One skip per wheel notch or touchpad swipe; momentum is ignored.
- Scroll on the meter to change the system volume, with GNOME's volume pop-up, just like scrolling over the speaker icon.
- A setting to turn scrolling off.

## 1.2.0 (2026-11-15)

- A progress bar in the media card, with elapsed and remaining time. Drag or click it to jump in the track; arrow keys and scrolling on it work too. It follows jumps made in the player itself.
- The position is read once a second only while the card is open and the track plays. Live streams get no bar, and players that cannot seek get a plain progress line.

## 1.1.0 (2026-11-15)

- A settings panel: accent colour (with a reset to Tokyo Night blue), pill darkness, show or hide the cover and the level meter, open the card on hover or only on click, the hover delay, and GNOME's own clock options (date, weekday, seconds).
- Accent and pill darkness apply live through a generated override stylesheet, which survives light and dark theme switches.
- A gjs smoke test that builds the settings page and checks every row is bound both ways, using in-memory settings.

## 1.0.0 (2026-11-15)

First release.

- The top bar clock becomes a 22 px pill that fits the 28 px WhiteSur bar, centred both ways, in Tokyo Night dark with a `#7aa2f7` accent.
- Cover art on the left and a three-bar level meter on the right while media plays or is paused.
- A media card on hover or click: cover, title, artist, app, and previous, play or pause, and next. Middle click plays or pauses.
- GNOME's notification indicator inside the pill: unread in the accent, Do Not Disturb in grey.
- Covers are read only from local files, checked (regular file, at most 4 MiB, at most 2048 px a side, PNG, JPEG, GIF, WebP or BMP) and shrunk to a 96 px cached copy before the shell shows them. Web covers are never downloaded.
