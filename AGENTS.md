# AGENT OPERATING INSTRUCTIONS — DeckVerse
1. Read this file and SUPABASE_HUB_RULES.md before writing.
2. Single project scope only: Rishikeshsanin/addictive-themed-card-games; Supabase Project Hub ref nowlwprtcnieihelqjoa, schema deckverse, app slug deckverse.
3. Before ANY Project Hub database write read hub.read_me_first and check hub.apps, registered resources and assigned schema. Follow mandatory steps without exception.
4. Treat BlindRank, MostLikely, Imposter X and every other project as separate companies. Never alter their schema, data, functions, storage, service keys or deployments.
5. Use only fully-qualified deckverse.* SQL objects. No shared public tables. No blanket privileges, no project admin/service_role key in an app.
6. Repository must contain AGENTS.md and SUPABASE_HUB_RULES.md before any schema/functions are created. Register app and scoped resources before using them.
7. Protect unseen cards, hidden deck order, player session tokens, concurrency and turn validation on the server.
8. No secret values, passwords or LiveKit API keys in Git history or frontend.
9. Document actual behavior and test evidence honestly; never claim a browser or multiplayer test passed without execution.
10. Brand imagery and content must follow the IP owner's permission requirements for any public/commercial use.