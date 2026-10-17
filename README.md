# Skyward Aces

A 3D browser dogfighting game, from WW1 biplanes to modern fighter jets. It uses three.js with no build step: open `index.html` in Chrome, Edge or Firefox.

## Menus
- **Top bar**: research XP, coins, and the pilot profile (level, XP to the next level, K/D ratio, other stats and settings). Each level needs 1.1× the XP of the one before it.
- **Play**: Singleplayer or Multiplayer, then one of four modes:
  - **Destroy**: two teams of 1–60. Kills score 3; small, medium and big bases score 2, 3 and 5. The host sets the match length. The team with the most points wins.
  - **Dogfight**: 1v1 up to 8v8, with 0–12 respawns each. The last team flying wins.
  - **Missions**: historical missions for the nation of your aircraft, closest era first. Mission types are fighter sweeps, bomber intercepts, ground strikes and bomber escorts.
  - **Survival**: co-op waves of enemy fighters, with bombers every third wave.
- **Multiplayer**: the host clicks *Generate join code* and shares the code; other players enter it under *Join*. The host picks the mode and settings, can move players between teams, and chooses whether empty slots are filled with bots. Bots fly the average era of the human players. If a player drops out mid-battle, a bot takes over their aircraft.
- **Hangar**: a tab for each nation, aircraft grouped by era, full stats and a 3D preview.
- **Modifications**: ammunition belts per gun; bombs, rockets, missiles and gun pods per hardpoint, limited by station type, weight per pylon, total payload, era and nation; airframe upgrades. Everything bought can be fitted and removed freely.
- **Research**: spend XP on aircraft. In each nation you can research up to one era above the newest era you own in that nation. Every nation starts with one WW1 aircraft.
- **Achievements**: 30 achievements with progress bars.

## Controls
| | |
|---|---|
| Mouse | aim; the aircraft flies towards the circle |
| Left mouse | guns (and gun pods) |
| Right mouse (hold) | look around |
| W / S | throttle; hold W at 100% for WEP or afterburner |
| A / D, Q / E | roll, rudder (keyboard overrides) |
| Arrow keys | keyboard stick |
| Space | drop bombs |
| R | fire rockets |
| F | fire missile (wait for the lock tone) |
| X | flares |
| C | chase / nose camera |
| Tab | scoreboard |
| Esc | pause / leave |

## How the simulation works
- **Flight model** (`js/flight.js`): thrust, drag and climb are derived from each aircraft's real top speed, climb rate, turn time, roll rate and G limit. Lift depends on angle of attack, and the wing stalls past the critical angle. Turning bleeds speed, piston engines lose power at altitude, and controls stiffen in very fast dives.
- **Damage** (`js/damage.js`): there are no health bars. Each aircraft has hit boxes for engines, fuel tanks, crew, ammunition, wings, tailplane, fin and fuselage. Damaged engines lose power, smoke, seize or catch fire. Fuel tanks leak (self-sealing tanks close the holes) and can burn or explode. Wings lose lift, which makes the aircraft roll, and can snap off. A dead pilot means a dead aircraft. High-explosive shells spread fragments to neighbouring parts; armour plate stops small rounds from behind. The aircraft-condition panel shows the hit boxes coloured by state.
- **Kill credit** (`Match.resolveKill`): when an aircraft is shot down (crew killed, or the aircraft explodes or breaks up), the enemy that did the most damage gets the kill. When it crashes with ≥10% damage, the top damage dealer gets it. Below 10%, credit goes to an enemy that hit it in the last 20 s, otherwise to the enemy aircraft closest to the crash.
- **Bases** have AA matching the era: machine guns and "Archie" in WW1, light and heavy flak in WW2, radar guns and SAMs later. Their health bar appears when you get close.

## Online play
Online play is peer-to-peer over WebRTC (PeerJS), with join codes. Most home networks connect directly. Mobile data and school or office networks may need a relay (TURN) server, which you can add in `js/netconfig.js`.

## Tests (headless Chrome)
```
node tools/tests/cdp.mjs tools/tests/smoke.mjs     # menus + every mode (PLANE=, MODES=, SECS=)
node tools/tests/cdp.mjs tools/tests/perf.mjs      # 60v60 simulation cost
node tools/tests/cdp.mjs tools/tests/uishots.mjs   # menu screenshots
node tools/tests/cdp.mjs tools/tests/gallery.mjs   # aircraft model sheets (NATION= or IDS=)
node tools/tests/mp.mjs                            # two tabs: host + join code + battle (needs internet)
```
Screenshots go to `tools/tests/shots/`.
