# Static images

Place the McHR&TA / McRaaN logo here as **`logo.png`**:

    static/img/logo.png

It is referenced by:
- Login screen  — `static/js/app.js` (showLogin)
- Sidebar header — `static/js/app.js` (buildSidebar)

Both reference `/static/img/logo.png?v=20260521a`. Until the file exists,
both fall back to the original text logo via an `onerror` handler, so the
app never shows a broken image.

If you replace the logo later, bump the `?v=` query string in `app.js`
(both references) so browsers pick up the new file instead of a cached one.

A wide horizontal lockup (~3:1) works best. The login card is light, so a
white/transparent background is fine; the sidebar renders the logo inside a
small white rounded container so it reads against the dark nav background.
