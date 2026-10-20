# DeckVerse design context

## North star
DeckVerse is a dark, energetic, nostalgic card-table experience: schoolyard rivalry presented with crisp modern game feedback. Preserve the established lime/violet palette, Space Grotesk display type, compact stat cards, and strong separation between concealed and revealed information.

## Interaction contract
- Mobile battle play is the primary layout; both cards and every stat action must remain reachable without horizontal scrolling.
- Interactive battle targets are at least 44 CSS pixels high and expose visible keyboard focus.
- Motion supports atmosphere but respects `prefers-reduced-motion`.
- Hidden opponent information is never inferred or rendered by the client before the authoritative reveal.
- Loading, connection, reveal, and error feedback must not obstruct card comparison or move primary controls unexpectedly.

## Runtime ownership
- `styles.css` is the canonical visual-token and responsive-layout source.
- `src/app.js` owns screen rendering and game feedback.
- `src/reveal.js` owns reveal timing/acknowledgement behavior shared with the API.
- Existing components and visual language are extended in place; this audit does not authorize a redesign.
