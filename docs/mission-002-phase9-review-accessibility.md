# Mission 002 Phase 9: manual-review accessibility

## Keyboard behavior

The read-only Mission Review page uses a semantic table. Each review ID in the first cell is a native button with an accessible “Open review detail” name. It is reachable with Tab and opens the selected record with Enter or Space. The Space-key handler prevents browser scrolling before opening the detail. All filters, the apply button, pagination buttons, detail close button, and fingerprint copy buttons have a visible `:focus-visible` indicator.

## Detail behavior

The detail remains an in-page, read-only section rather than a modal: it does not trap focus. Its close button and Escape close an open detail. When practical, focus returns to the review-ID button that opened it. The detail heading is an `h2`; its fingerprints and mission summary are `h3` subsections.

## Screen-reader announcements

List and detail loading use polite status announcements. List/detail failures use alert announcements, and an empty filtered list is exposed as a polite status. The table has a caption and scoped column headers. Filter controls, page-size selection, apply, and previous/next controls have explicit accessible names.

Fingerprint copying writes a bounded live-region message: “Fingerprint copied.” It never exposes the fingerprint value. Unavailable clipboard access is caught and announced safely without interrupting the read-only UI.

## Unchanged read-only boundary

The page still displays **Manual review only**, **No repair has been executed**, **Production execution disabled**, and **Provider mutation disabled**. Phase 9 adds no mutation controls, API routes, migrations, authentication changes, store changes, or Mission lifecycle changes. All browser requests remain GET-only; the UI cannot approve, reject, resolve, retry, replay, execute, repair, cancel, delete, edit, or invoke GitHub/provider actions.
