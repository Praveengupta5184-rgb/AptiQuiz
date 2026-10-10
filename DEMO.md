# AptiQuiz Live Demo Script

**Total Time**: ~3 minutes.
**Setup**: Open three browser windows side-by-side. 
- Window 1: Host / Spectator Projector
- Window 2: Player A (Simulating a Mobile Phone - open DevTools and set to iPhone 12)
- Window 3: Player B (Simulating a Mobile Phone)

### Step 1: Lobby & Joining (0:00 - 0:45)
1. In Window 1 (Host), create a room. Point out the clear, unambiguous 5-character join code.
2. In Window 2 (Player A), join the room. Type a name and hit join.
3. In Window 3 (Player B), join the room.
4. Watch Window 1 as the names instantly pop up on the lobby screen.
5. *Feature highlight*: Disconnect Player B's internet (Offline mode in DevTools). Notice the UI handles it gracefully. Reconnect them. They are still in the room.

### Step 2: The Race (0:45 - 2:00)
1. In Window 1, the Host starts the game.
2. The question appears simultaneously on all three screens.
3. Show the **Pressure Meter** in Window 1. Right now, it's green ("Relaxed").
4. Have Player A answer correctly immediately. Have Player B answer incorrectly after 5 seconds.
5. The timer expires. The Reveal screen drops in.
6. Look at the **Race Track Leaderboard**. Player A's avatar zooms ahead and gets a 🔥 (Streak). Player B barely moves.
7. Explain that Player A got a speed bonus because they answered in 1 second, and the server compensated for their ping.

### Step 3: Anti-Cheat & Analytics (2:00 - 3:00)
1. Open the Network tab in Window 2. Show that the incoming payload for the next question *does not* contain the `correct_option_index`. It is impossible to cheat by reading the network.
2. Fast forward through the questions.
3. The game finishes. The Podium screen appears.
4. Show the Host dashboard (Window 1). Demonstrate the analytical breakdown: it shows that the room struggled specifically with "Data Interpretation", giving the faculty actionable data for the next lecture.
