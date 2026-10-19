# Project Hub safety contract — DECKVERSE
Project ID: `nowlwprtcnieihelqjoa`
App slug and isolated schema: `deckverse`
Public tables: prohibited.

## Mandatory workflow
1. SELECT hub.read_me_first first, every session.
2. Verify hub.apps registered with slug == schema_name == deckverse before any app schema object write.
3. Verify this repository's AGENTS.md and SUPABASE_HUB_RULES.md exist, then acknowledge the safety contract per Hub API.
4. Register only deckverse-specific schema, tables, edge functions, RPCs and resource names in hub.app_resources.
5. Use fully qualified deckverse.* in DDL, SQL and grants; test and enable RLS on all user-facing tables.
6. Use only a dedicated limited `deckverse_app` PostgreSQL role in the game server. Never allow client access to raw PostgreSQL or browser exposure of a database credential.
7. Never touch any other schema, shared Auth/OAuth settings, storage project keys, billing or Project Hub infrastructure.
8. Run security advisor after every meaningful DDL or policy migration.
9. Stop and request user approval if an action could affect other apps or global configuration.
10. Do not use DROP SCHEMA CASCADE, unscoped destructive queries or broad GRANTs.
11. Maintain migrations, tests and an auditable changelog. `deckverse` resources only.

## Runtime
Server handles short-lived session tokens, hash storage, random shuffles, atomic turn resolution, card pot, tie rotation, reconnect, expiration and rematch.
LiveKit creates private rooms with a `deckverse-` prefix and short-lived tokens; a failing call must not invalidate game state.
