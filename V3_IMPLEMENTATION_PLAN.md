# AptiQuiz Master Implementation Plan

## Stage 1 — Repository Audit
- **Feature A (Team Battles):** Database schema exists (`teams`, `team_id` in `room_players`). Backend room creation and frontend UI lack team mode selection, team assignment, and team leaderboards.
- **Feature B (Daily Challenges):** DB schema exists (`daily_challenges`, `daily_attempts`). No frontend UI or backend routes implemented yet.
- **Feature C (Faculty Host Mode):** Host can create/start rooms. Question analytics exist in DB (`topic_stats`) but need a dedicated UI and CSV export logic.
- **Feature D (Fair Power-ups):** DB schema exists (`powerups` JSONB on `room_players`). No frontend usage or backend socket handlers to consume/apply them.
- **Feature E (Spectator Mode):** [COMPLETED] Separate `/spectate/:roomCode` route and spectator socket logic implemented.
- **Feature F (Adaptive Difficulty):** [COMPLETED] Real-time difficulty adjustment engine implemented in GameRoom based on class accuracy.
- **Feature G (Accessibility):** [COMPLETED] Basic CSS review for contrast and ARIA labels.
- **Feature H (Robust Reconnection):** Existing socket reconnect logic uses JWT session tokens, but needs battle-testing to ensure state is correctly recovered and deadlines enforced.
- **Feature I (College League):** DB schema exists (`colleges`, `league_scores`). Needs UI and backend aggregation jobs.

## Stage 2 — Execution Strategy
Due to the sheer size of the implementation, I will implement these features iteratively in chunks:
1. **Chunk 1:** Feature A (Team Battles) + Feature C (Faculty Host Mode Analytics).
2. **Chunk 2:** Feature D (Fair Power-ups) + Feature H (Reconnection hardening).
3. **Chunk 3:** Feature B (Daily Challenges) + Feature I (College Leagues).
4. **Chunk 4:** Feature E (Spectator Mode) + Feature F (Adaptive Difficulty) - [COMPLETED]
5. **Chunk 5:** Feature G (Accessibility) & Feature J (Polish) - [COMPLETED]
