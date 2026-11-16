// Notification peek: where a new notification shows, and the one line of text the pill shows for it.
// Pure: runs under node --test.

// The setting's choices: the pill instead of GNOME's banner, the pill and the banner, or the banner only
export const PEEK_MODES = ['instead', 'with-banner', 'off'];
// GNOME's MessageTray.Urgency.CRITICAL
export const CRITICAL = 3;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' };

/**
 * 'peek' (pill only), 'both' (pill and GNOME's banner) or 'banner' (GNOME only). Critical notifications
 * always keep the banner; in fullscreen the bar is hidden, and with the notification list open the pill
 * is under it, so GNOME decides alone then.
 * @param {{mode: string, urgency: number, fullscreen: boolean, menuOpen?: boolean}} input
 * @returns {'peek'|'both'|'banner'}
 */
export function notificationRoute({ mode, urgency, fullscreen, menuOpen = false }) {
    if (fullscreen || menuOpen || !PEEK_MODES.includes(mode) || mode === 'off')
        return 'banner';
    if (mode === 'with-banner' || urgency >= CRITICAL)
        return 'both';
    return 'peek';
}

function decodeEntities(text) {
    return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, name) => {
        if (name[0] !== '#')
            return ENTITIES[name.toLowerCase()];
        const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    });
}

/**
 * One line of plain text. Markup (which notification bodies may use) loses its tags and entities.
 * @param {unknown} text
 * @param {boolean} markup
 * @returns {string}
 */
export function plainText(text, markup) {
    if (typeof text !== 'string')
        return '';
    const plain = markup ? decodeEntities(text.replace(/<[^>]*>/g, '')) : text;
    return plain.replace(/\s+/g, ' ').trim();
}

/**
 * The title and body the pill shows, falling back to the app's name and never repeating itself.
 * @returns {{title: string, body: string}}
 */
export function peekText({ title, body, useMarkup, appName }) {
    let shownTitle = plainText(title, false) || plainText(appName, false);
    let shownBody = plainText(body, useMarkup);
    if (!shownTitle) {
        shownTitle = shownBody;
        shownBody = '';
    }
    if (shownBody === shownTitle)
        shownBody = '';
    return { title: shownTitle || 'Notification', body: shownBody };
}
