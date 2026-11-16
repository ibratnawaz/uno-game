## Improved master prompt — UNO Game Web App

# Project: Build a Multiplayer UNO Card Game Web Application

## 1. ROLE AND EXPECTATIONS

Act as a Senior Full Stack Engineer, Software Architect, Game Logic Engineer, UI/UX Designer, and QA Engineer.

You are responsible for designing, developing, testing, and delivering a fully functional, production-quality, multiplayer UNO-inspired web application.

Do not create just a UI prototype or static demonstration. Implement the complete working application, including game logic, real-time multiplayer capabilities, bot opponents, room management, and responsive UI.

Think like an experienced product engineering team building a real consumer-facing gaming application.

Prioritize:

1. Functional correctness.
2. Official standard game-rule compliance.
3. Reliable real-time multiplayer functionality.
4. Excellent mobile-first UI/UX.
5. Security and game-state integrity.
6. Easy and inexpensive deployment.

---

# 2. PROJECT CONTEXT

Create a new project directory named, if it do not exsits:

`uno-game`

The objective is to develop an online UNO-style card game that anyone can access through a web browser without installing an application.

Users should be able to:

- Play against friends online.
- Create private game rooms.
- Invite friends using a shareable link or room code.
- Join an existing room.
- Play against computer-controlled bots.
- Configure optional house rules.
- Enjoy a smooth, responsive gaming experience on mobile, tablet, and desktop.

The application should be straightforward to deploy and host using free-tier hosting services.

Avoid paid APIs, commercial game engines, or services that require a subscription for the core functionality.

**Important:** The application should use an original visual identity and original card artwork. Do not use unauthorized official UNO logos or copyrighted artwork. It is an unofficial UNO-inspired game.

---

# 3. INPUTS AND GAME CONFIGURATION

The application should support the following game configuration.

## Player capacity

| Requirement                                | Value          |
| ------------------------------------------ | -------------- |
| Minimum total players                      | 2              |
| Maximum total players                      | 20             |
| Maximum additional members invited by host | 19             |
| Starting cards per player                  | 7              |
| Game modes                                 | Friends / Bots |

The player creating a room also occupies one player slot.

The application must never allow fewer than 2 or more than 20 total players in an active game.

## Game Mode A: Play With Friends

When a user selects "Play With Friends", display two options:

**1. Create Room**

The user can:

- Enter a nickname.
- Create a private room.
- Receive a unique room code.
- Receive a shareable invitation URL.
- Configure game rules before starting.
- Invite between 1 and 19 additional players.
- See joined players in a real-time lobby.
- Start the game when at least 2 players are present.

Room features:

- Unique, sufficiently random room code.
- Join using room code.
- Join using invitation link.
- Maximum 20 total players, including the host.
- Minimum 2 players to start.
- Display player names, avatars, connection status, and ready status.
- Host controls for starting the game and modifying room settings.
- Prevent additional players from joining once the room is full or the game has started, unless a supported reconnection flow applies.
- Allow players to leave the lobby.
- Handle host disconnection and reconnection gracefully.

**2. Join Room**

The user can:

- Enter a nickname.
- Enter the room code or open an invitation link.
- See the room's available seats.
- Join if the room is valid and has capacity.
- Wait in the lobby until the host starts the game.

Display meaningful error messages for invalid codes, full rooms, expired rooms, duplicate sessions, and disconnected hosts.

## Game Mode B: Play With Bots

When a user selects "Play With Bots":

Ask the user how many bots they want.

Requirements:

- Minimum bots: 1.
- Maximum bots: 19.
- Total participants must be between 2 and 20, including the human player.
- Allow the user to enter a nickname.
- Allow selection of bot difficulty: Easy, Medium, or Hard.
- Allow configuration of optional house rules.
- Start the game immediately after configuration.

Bot behavior:

- Bots must follow the same game rules as human players.
- Bots must make only legal moves.
- Bots must understand playable cards, draw cards, wild cards, reverse, skip, and penalty cards.
- Bots should call UNO appropriately.
- Bots should choose a valid color when playing a Wild card.
- Bots should respond appropriately to challenges when Wild Draw Four is played.
- Bot decisions should consider their hand and visible public game information, but must never access hidden information about other players' cards.
- Add realistic thinking delays so bots do not play instantaneously.
- Make difficulty levels meaningful through different legal decision strategies, not by cheating or accessing hidden game information.

---

# 4. GAME RULES AND GAME ENGINE

This is one of the most important requirements.

Implement the globally recognized standard/classic UNO gameplay rules as the default ruleset.

Do not casually invent or modify core game mechanics.

Use the standard UNO rulebook for the selected classic ruleset as the reference for game behavior.

## Standard card types

Support:

**Number Cards**

- 0 to 9.
- Four standard colors: Red, Blue, Green, Yellow.

**Action Cards**

- Skip.
- Reverse.
- Draw Two (+2).

**Wild Cards**

- Wild.
- Wild Draw Four (+4).

Implement correct card effects, turn progression, color selection, penalties, and deck management.

## Core gameplay rules

Implement the following:

1. Shuffle the deck before starting.
2. Deal 7 cards to each player.
3. Place the remaining cards in the draw pile.
4. Reveal the initial discard card and apply the correct starting-card rules.
5. Determine the first player and turn direction.
6. Allow players to play matching cards by color, number, or symbol.
7. Allow Wild cards to be played according to the rules.
8. Apply Skip, Reverse, Draw Two, and Wild Draw Four effects correctly.
9. Allow only the current player to make a move.
10. Allow a player to draw a card when no playable card is available.
11. Allow the player to play the newly drawn card if permitted by the standard rules.
12. Reshuffle the discard pile into the draw pile when required, preserving the active top discard card.
13. Detect the winner when a player legally empties their hand.
14. Display a proper game-over screen and winner announcement.

## UNO declaration

Implement the UNO declaration rule.

When a player has exactly one card remaining, they must declare UNO.

If the player forgets and another player catches them before the next player's turn begins, apply the standard penalty of drawing two cards.

Provide an easy-to-use UNO button that is clearly visible during gameplay.

## Wild Draw Four challenge

Implement the standard Wild Draw Four legality and challenge mechanism.

The player can only legally play Wild Draw Four when they do not have a card matching the currently active color.

Allow the affected player to challenge the move.

Implement the appropriate outcomes:

- If the challenge succeeds, the player who illegally played Wild Draw Four receives the penalty.
- If the challenge fails, the challenger receives the applicable penalty.
- Maintain correct turn progression afterward.

Do not simplify or omit this mechanic.

## Special consideration: 20-player capacity

A traditional single UNO deck may not contain enough cards for 20 players.

Implement automatic deck scaling using multiple standard decks when necessary.

Maintain the same standard card behavior and game mechanics, with sufficient cards for the selected player count.

Do not change the number of cards dealt per player merely to accommodate a larger room.

Clearly document that supporting up to 20 participants is an extended multiplayer capacity, not a claim that the traditional game is officially designed for 20 players.

---

# 5. OPTIONAL HOUSE RULES

Standard UNO rules must remain the default.

Provide a separate "House Rules" configuration panel where users can enable additional rules before starting a game.

Each rule must have:

- A clear name.
- A short explanation.
- An enable/disable toggle.
- A visual indication when active.
- Correct implementation in the game engine.

Suggested optional rules:

## A. Stacking Draw Cards

Allow users to configure stacking behavior independently.

Provide the following options:

- +2 on +2.
- +4 on +4.
- +4 on +2.
- +2 on +4.

Allow stacking to be disabled entirely.

Clearly define how penalties accumulate and how the next player can respond.

Ensure the behavior of Wild Draw Four challenges remains well-defined when stacking is enabled.

## B. 7-0 Rule

- Playing a 7 allows the player to exchange hands with another selected player.
- Playing a 0 rotates everyone's hands in the current direction of play.

## C. Jump-In Rule

Allow a player to play an identical card immediately when it matches the current top discard card, subject to the configured rule's restrictions.

## D. Draw Until Playable

Allow users to choose between:

- Standard one-card draw behavior.
- Drawing repeatedly until a playable card is found.

## E. Force Play

When enabled, automatically play a playable card drawn from the draw pile.

## House Rule Defaults

- All non-standard house rules must be disabled by default.
- Users must be able to see active rules in the lobby before starting.
- Clearly distinguish standard rules from optional house rules.
- Rules must remain consistent throughout a game.
- Bots must obey exactly the same active rules as human players.

---

# 6. GAMEPLAY UI/UX REQUIREMENTS

This application must follow a mobile-first design approach.

The UI should feel like a polished modern multiplayer gaming application, not a basic CRUD website.

## Design direction

Use:

- Modern, premium gaming aesthetics.
- Clean typography.
- Smooth transitions and animations.
- Rounded cards and buttons.
- Subtle gradients and shadows.
- Clear color contrast.
- Visually distinctive UNO-style cards.
- Consistent spacing and visual hierarchy.

Avoid:

- Cluttered interfaces.
- Excessive animations.
- Tiny card interactions on mobile.
- Excessively bright or distracting backgrounds.
- Unnecessary navigation.

## Main application screens

### Screen 1: Home / Landing Page

Include:

- Game logo and application name.
- Attractive welcome section.
- Play With Friends button.
- Play With Bots button.
- How To Play section.
- Standard Rules and House Rules explanation.
- Responsive navigation.

### Screen 2: Create / Join Room

Create a clean room-management interface.

Provide:

- Nickname field.
- Create Room option.
- Join Room option.
- Room code input.
- Share invitation functionality.

### Screen 3: Lobby

Display:

- Room code.
- Copy invitation link button.
- Player list.
- Player avatars.
- Ready indicators.
- Active game configuration.
- House Rules summary.
- Host-only Start Game button.
- Leave Room button.

### Screen 4: Game Table

This is the application's most important screen.

Build an engaging UNO-style game table.

Display:

- Current player's hand.
- Opponents and their card counts.
- Player avatars and usernames.
- Current turn indicator.
- Current direction indicator.
- Draw pile.
- Discard pile.
- Selected active color.
- Draw Two and Wild Draw Four effects.
- UNO declaration button.
- Current game status.
- Game activity notifications.

The current player's hand should be displayed prominently.

On mobile:

- Cards should be easy to view and select.
- Support horizontal card scrolling when necessary.
- Avoid overlapping important controls.
- Keep the draw and discard piles accessible.
- Use responsive player positioning around the table.
- Keep the UNO button easily accessible.
- Ensure that game information remains readable.

### Screen 5: Color Selection

When a player uses a Wild card:

- Display a clear color selection interface.
- Show all four available colors.
- Disable invalid selections.
- Apply the selected color immediately after confirmation.

### Screen 6: Game Over

Display:

- Winner's name and avatar.
- Celebration animation.
- Final game result.
- Play Again button.
- Return to Lobby or Home option.
- Relevant score information if scoring is enabled.

---

# 7. REAL-TIME MULTIPLAYER REQUIREMENTS

Multiplayer must work between different devices and browsers over the internet.

Do not build a fake multiplayer experience that only works inside one browser.

Implement:

- Real-time player synchronization.
- Real-time turn updates.
- Real-time card play updates.
- Real-time draw pile and discard pile updates.
- Real-time game status updates.
- Player join and leave events.
- Reconnection support.
- Graceful handling of connection failures.
- Prevention of duplicate moves.
- Prevention of simultaneous conflicting actions.
- Room expiration and cleanup where feasible.

Game state must be authoritative and validated on the backend.

Never trust the client to decide whether a move is legal, change the current player, assign cards, or declare a winner.

Protect players' private hands. Other players should only see the appropriate public game information, such as card counts.

Use secure room membership validation and database access policies.

---

# 8. TECHNICAL ARCHITECTURE

Build an architecture that is simple, maintainable, scalable enough for the expected usage, and easy to deploy.

Preferred technology stack:

### Frontend

- React.
- TypeScript.
- Vite.
- Tailwind CSS.
- Zustand or another lightweight state management solution.
- React Router if needed.
- Framer Motion or CSS animations for polished interactions.

### Backend / Realtime

Prefer Supabase for:

- Room management.
- Guest/anonymous player sessions.
- Persistent game metadata.
- Real-time multiplayer synchronization.
- Backend-authoritative game actions.
- Secure database policies.

You may use Supabase Edge Functions or secure Postgres functions for authoritative game actions.

The exact architecture may be improved if another free-tier solution is demonstrably simpler and more reliable.

### Hosting

Choose a practical free-tier deployment combination.

Possible choices:

- Vercel.
- Netlify.
- Cloudflare Pages.
- GitHub Pages for compatible static frontend deployments.

Backend services must also have a suitable free-tier option.

Before selecting services, check their current free-tier limitations and explain any relevant restrictions, such as usage quotas, project inactivity, database limits, or real-time connection limits.

Do not assume that free-tier services provide unlimited hosting or bandwidth.

### Environment configuration

- Keep secrets out of source code.
- Use environment variables.
- Create a `.env.example`.
- Include deployment instructions.
- Never commit private service-role keys.
- Configure production and local development environments separately.

---

# 9. CODE QUALITY AND PROJECT STRUCTURE

Maintain clean separation between:

- UI components.
- Game engine.
- Card and deck models.
- Turn management.
- Rule validation.
- House rule configuration.
- Bot decision logic.
- Room management.
- Realtime synchronization.
- Backend integration.
- Shared utilities.

Keep the game engine independent from React components wherever possible.

Use TypeScript interfaces and types for all important game entities.

Avoid:

- Large monolithic components.
- Duplicate game logic.
- Hardcoded game state.
- Unnecessary dependencies.
- Direct DOM manipulation when React state is appropriate.
- Business logic embedded inside UI components.

Write reusable, maintainable and well-documented code.

---

# 10. TESTING AND VALIDATION

Testing is mandatory.

Create unit tests for:

- Deck generation and shuffling.
- Card dealing.
- Valid and invalid moves.
- Turn progression.
- Reverse behavior.
- Skip behavior.
- Draw Two.
- Wild card color selection.
- Wild Draw Four legality.
- Challenge success and failure.
- UNO declaration.
- Stacking behavior.
- 7-0 rule.
- Jump-In rule.
- Winner detection.
- Deck reshuffling.
- Bot decision-making.
- Player limits.

Create integration tests for:

- Room creation.
- Room joining.
- Maximum room capacity.
- Minimum player requirement.
- Realtime synchronization.
- Concurrent move prevention.
- Player reconnection.
- Game completion.

Create end-to-end tests for:

1. A player creating a room.
2. Another player joining using the room code.
3. Starting a game.
4. Playing a complete game.
5. Winning and restarting.
6. Playing against bots.
7. Enabling optional house rules.

Test mobile and desktop layouts.

Ensure that all core functionality works before considering the project complete.

---

# 11. IMPLEMENTATION INSTRUCTIONS

Follow this execution sequence:

### Phase 1: Project Initialization

- Inspect the existing workspace.
- Create a new directory named `uno-game`.
- Initialize the frontend project.
- Install only required dependencies.
- Establish the project architecture.
- Configure TypeScript, linting, formatting, and testing.

### Phase 2: Game Engine

- Implement deck generation.
- Implement game state.
- Implement all standard rules.
- Implement turn progression.
- Implement card effects.
- Implement UNO declaration and challenges.
- Implement optional house rules.
- Write game engine tests.

### Phase 3: Single-Player and Bot Mode

- Implement bot configuration.
- Implement bot decision logic.
- Implement Easy, Medium and Hard difficulties.
- Test games with different bot counts, including 19 bots.

### Phase 4: Multiplayer

- Implement backend integration.
- Implement room creation and joining.
- Implement room codes and invitation URLs.
- Implement real-time game synchronization.
- Implement secure game actions.
- Implement reconnection and disconnection handling.

### Phase 5: UI/UX

- Build all application screens.
- Implement the mobile-first game table.
- Add card animations and transitions.
- Add loading, error, empty and success states.
- Ensure consistent design across devices.

### Phase 6: Testing

- Run linting.
- Run type checking.
- Run unit tests.
- Run integration tests.
- Run end-to-end tests where configured.
- Run a production build.
- Fix all critical errors.

### Phase 7: Documentation and Deployment

- Write the README.
- Add `.env.example`.
- Document local development.
- Document backend configuration.
- Document production deployment.
- Explain any free-tier limitations.

Do not stop after creating the project structure or a landing page. Complete all core features.

---

# 12. EXPECTED OUTPUT AND DELIVERABLES

The final output must include:

### A. Project Files

Create and implement the complete application inside:

`./uno-game/`

Provide a clean directory structure.

### B. Working Application

A fully functional application with:

- Friends multiplayer.
- Room creation and joining.
- Invitation links.
- Bot mode.
- Standard UNO gameplay.
- Optional house rules.
- Responsive mobile-first design.

### C. Documentation

Provide:

- `README.md`
- `.env.example`
- Installation instructions.
- Local development instructions.
- Backend setup instructions.
- Deployment instructions.
- Game rules documentation.
- House rules documentation.

### D. Test Results

Report:

- Build status.
- Type-check status.
- Lint status.
- Unit test results.
- Integration test results.
- End-to-end test results, where configured.
- Any known limitations.

### E. Final Summary

Provide:

1. What was implemented.
2. Technology stack.
3. Project directory structure.
4. How to run locally.
5. How to configure multiplayer backend.
6. How to deploy using free-tier services.
7. Any remaining tasks or limitations.

---

# 13. DEFINITION OF DONE / ACCEPTANCE CRITERIA

The project is not complete unless all of the following are satisfied:

- A new `uno-game` directory exists.
- The application builds successfully.
- The application is responsive on mobile and desktop.
- A user can play against at least one bot.
- A user can play against up to 19 bots.
- A user can create a room.
- A user can invite up to 19 additional players.
- Two or more people can play together on separate devices.
- A room cannot exceed 20 total players.
- A room cannot start with fewer than 2 players.
- Room codes and invitation links work.
- Real-time multiplayer synchronization works.
- Standard UNO rules are correctly implemented.
- Wild Draw Four challenge logic works.
- UNO declaration and penalty work.
- Optional house rules work independently.
- Bots follow the active game rules.
- Private player hands are protected.
- Disconnection and reconnection are handled.
- The game can be completed and restarted.
- Documentation and deployment instructions are available.
- No critical errors remain in the production build.

## FINAL EXECUTION DIRECTIVE

Start by inspecting the current workspace and creating the `uno-game` directory.

Then implement the application end to end.

Make reasonable engineering decisions where details are not specified. Do not repeatedly ask for confirmation about minor implementation choices.

Do not provide only a development plan, pseudo-code, screenshots, or sample components.

I expect actual working source code, a properly implemented game engine, real multiplayer functionality, automated tests, and deployment-ready documentation.

If a feature cannot be completed because of an external service dependency or environment limitation, clearly document the blocker rather than pretending it works.

**The final standard is simple: a user should be able to open the deployed website, create a room or play with bots, enjoy a complete UNO game on their phone, and invite friends to join from their own devices.**

## Important architectural decisions I've built into this prompt

1\. Hosting architecture

Recommended

React + Vite + TypeScript

Frontend application

Supabase

Database, realtime communication, secure game actions

Vercel / Cloudflare Pages

Frontend hosting on a suitable free tier

2\. Game engine architecture

Keep the game engine independent from React. This makes testing rules, adding bots, and handling multiplayer much easier.

3\. Multiplayer security

Game moves should be validated by the backend. A browser must never be able to manipulate another player's cards or bypass turn restrictions.

## One important distinction about the rules

The default game should follow standard UNO rules. Stacking +2 and +4 is a popular house-rule variation, not part of standard classic gameplay. Keeping these two rule categories separate prevents confusion between friends.

# CRITICAL REQUIREMENT: Persistent Game Sessions, Reconnection & Disconnect Recovery

**Priority: Critical — Mandatory Core Functionality**

The game must support persistent multiplayer sessions. A player's session and game progress must never be lost merely because of a page refresh, accidental tab closure, browser crash, network interruption, device connectivity issue, or temporary disconnection.

The game must support seamless reconnection and resume the player from their exact previous state.

## 1. Persistent Player Identity

Every player joining a room must receive a unique, persistent player identity and a secure reconnection credential.

Requirements:

- Generate a unique player/session identifier.
- Persist the reconnection credential securely in the browser.
- Restore the player session automatically after a page refresh or browser reopening.
- Allow the player to reconnect using their original room invitation link and a valid recovery credential.
- Do not create a duplicate player entry when an existing player reconnects.
- Do not rely exclusively on the player's nickname or room code to identify returning players.
- Preserve the player's original seat, username, avatar, cards, game status, and turn position.
- Never reset or recreate the game when a player reconnects.

Provide a visible "Reconnect to Game" mechanism if automatic reconnection fails.

For recovery from another browser or device, support a secure player recovery code or equivalent authentication mechanism.

## 2. Turn-Aware Disconnection Handling

The behavior must depend on whose turn it is when the disconnection happens.

### Scenario A: Player disconnects during their own turn

Example:

- There are 5 players: A, B, C, D and E.
- It is Player C's turn.
- Player C loses internet connectivity or refreshes the page.

Expected behavior:

1. Immediately detect Player C's disconnection.
2. Preserve the complete game state.
3. Pause gameplay and prevent the turn from advancing.
4. Display a notification to all players: "Player C disconnected. Waiting for reconnection."
5. Keep Player C's cards and pending actions unchanged.
6. When Player C reconnects, restore their exact hand and current turn.
7. Allow Player C to continue playing normally.

Do not automatically skip their turn, draw cards, play a card, assign a penalty, or substitute a bot.

### Scenario B: Player disconnects during another player's turn

Example:

- There are 5 players: A, B, C, D and E.
- It is Player B's turn.
- Player D disconnects.

Expected behavior:

1. Allow Player B to continue playing.
2. Allow Player C to play normally.
3. Allow Player E to play normally.
4. When the turn reaches Player D, pause the game.
5. Display: "Waiting for Player D to reconnect."
6. Preserve Player D's complete game state.
7. When Player D reconnects, allow them to play their pending turn.

The game must not skip Player D or automatically play on their behalf.

### Scenario C: Player refreshes or accidentally closes the browser

Refreshing the page, closing and reopening a tab, navigating away, or reopening the browser must not create a new player session.

On returning:

- Identify the existing player session.
- Identify the active room.
- Restore the original player identity.
- Restore the original cards.
- Restore the current turn.
- Restore any pending game actions.
- Continue the game without restarting the room.

### Scenario D: Temporary network interruption

Implement connection monitoring using appropriate heartbeat/reconnection mechanisms.

- Detect temporary network interruptions.
- Display a reconnecting status.
- Automatically attempt reconnection.
- Avoid declaring a player permanently disconnected because of a brief network interruption.
- Do not advance past a disconnected player's pending turn.
- Preserve their game state until they reconnect or the host explicitly removes them.

A disconnection detection grace period may be used to prevent false disconnect alerts, but it must never result in a disconnected player's turn being automatically skipped.

## 3. Host Disconnection Handling

The room creator (host) must also receive the same persistent-session protection as other players.

If the host disconnects:

- Do not destroy the room.
- Do not terminate the game.
- Do not reset the game state.
- Preserve the host's identity and privileges.
- Allow other connected players to continue if it is not the host's turn.
- Pause when the host's turn arrives, if the host is still disconnected.
- Restore the host's original permissions after reconnection.

If the host refreshes the page or closes the browser accidentally, they must be able to return as the original host.

## 4. Host-Controlled Player Removal

The host must have the ability to remove a disconnected player from an ongoing game.

Requirements:

- Display disconnected players clearly in the lobby and game interface.
- Provide a host-only "Remove Player" action.
- Ask for confirmation before removing a player.
- Do not allow regular players to remove other players.
- Once the host confirms removal, safely remove that player from the active game.
- Update the turn order and player list correctly.
- Handle removal when it is the disconnected player's turn.
- Ensure that the remaining game continues without corrupting card counts, turn progression, or game state.
- Apply a deterministic and documented cleanup policy to the removed player's cards.
- Notify all remaining players that the disconnected player has been removed.

A removed player must not be allowed to reconnect to the active game using their old session credential.

## 5. Persistent Backend Game State

Game state must be stored and maintained on the backend, not only in React state, browser memory, or WebSocket connections.

Persist all relevant information, including:

- Room ID and room status.
- Player IDs and session identities.
- Host identity and permissions.
- Player connection statuses.
- Player seat/order.
- Each player's private hand.
- Draw pile.
- Discard pile.
- Current player and turn order.
- Current direction of play.
- Active card color.
- Pending penalties.
- Pending UNO declaration.
- Wild Draw Four challenge status.
- Pending color selections or other incomplete actions.
- Standard and optional house-rule configurations.
- Game status and winner information.

Persist every successfully validated game action using reliable transactions or equivalent atomic state updates.

Reconnection must retrieve the latest authoritative game state from the backend.

Never expose one player's private hand to another player during reconnection or normal gameplay.

## 6. Reconnection and Game Synchronization

When a disconnected player reconnects:

1. Authenticate their original player session.
2. Verify that the room and game still exist.
3. Restore their original player slot.
4. Retrieve the latest authoritative game state.
5. Synchronize their UI with the current game state.
6. Restore any pending turn or action belonging to them.
7. Update their connection status to online.
8. Notify the other participants that the player has reconnected.

Prevent duplicate moves, duplicate cards, repeated penalties, and multiple simultaneous actions caused by retries or reconnection.

Use server-authoritative validation and idempotent game actions.

## 7. Acceptance Tests — Mandatory

The feature is incomplete until all these scenarios pass:

- [ ] A player refreshes the page during their turn and resumes the same turn.
- [ ] A player closes the browser during their turn and reconnects without losing their cards.
- [ ] A player disconnects during another player's turn and the game continues.
- [ ] The game waits when the disconnected player's turn arrives.
- [ ] A disconnected player reconnects and plays their pending turn.
- [ ] A disconnected player reconnects after multiple other players have completed their turns.
- [ ] A player temporarily loses internet connectivity and automatically reconnects.
- [ ] The host refreshes the page and retains host privileges.
- [ ] The host disconnects while another player is playing and the game continues.
- [ ] The game waits when the disconnected host's turn arrives.
- [ ] The host can remove a disconnected player.
- [ ] Removing a disconnected player during their pending turn does not break the game.
- [ ] A reconnecting player does not create a duplicate room membership.
- [ ] Two browser tabs cannot submit conflicting actions for the same player.
- [ ] Reconnection does not expose private card information.
- [ ] The game state survives a frontend reload and realtime connection interruption.
- [ ] An active game can be recovered after a backend service or realtime connection restart, provided the persisted room and game data remain available.

**ABSOLUTE RULE: A temporary disconnection is not equivalent to leaving the game. A disconnected player remains a participant in the game until they reconnect or the host explicitly removes them. Never automatically skip their turn, replace them with a bot, or reset their session.**

The game must resume from the exact authoritative state where it was interrupted.
