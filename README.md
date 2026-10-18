# Skyward Aces

A 3D browser dogfighting game, from WW1 biplanes to modern fighter jets. It uses three.js with no build step: open `index.html` in Chrome, Edge or Firefox.

## Menus
- **Top bar**: research XP, coins, and the pilot profile (level, XP to the next level, K/D ratio, other stats and settings). Each level needs 1.1× the XP of the one before it.
- **Play**: Singleplayer or Multiplayer, then one of four modes:
  - **Destroy**: two teams of 1–60 (some bots fly bombers and attack aircraft). Kills 3, bases 2/3/5, tanks 0.5. Most points at the end wins, or win early by destroying every enemy base, or by destroying the enemy's airfields (they can no longer respawn) and shooting down every enemy aircraft. Kills score 3; small, medium and big bases score 2, 3 and 5. The host sets the match length. The team with the most points wins.
  - **Dogfight**: 1v1 up to 8v8, with 0–12 respawns each. The last team flying wins.
  - **Missions**: historical missions for the nation of your aircraft, closest era first. Mission types are fighter sweeps, bomber intercepts, ground strikes and bomber escorts.
  - **Survival**: co-op waves of enemy fighters, with bombers every third wave.
- **Multiplayer**: the host clicks *Generate join code* and shares the code; other players enter it under *Join*. The host picks the mode and settings, can move players between teams, and chooses whether empty slots are filled with bots. Bots fly the average era of the human players. If a player drops out mid-battle, a bot takes over their aircraft.
- **Hangar**: a tab for each nation (with its flag), aircraft grouped by era with a picture and type (fighter, heavy fighter, dive bomber, heavy bomber, strike aircraft...), full stats and a 3D preview.
- **Modifications**: ammunition belts per gun; bombs, rockets, missiles and gun pods per hardpoint, limited by station type, weight per pylon, total payload, era and nation; airframe upgrades. Everything bought can be fitted and removed freely.
- **Research**: spend XP on aircraft — fighters, bombers and attack aircraft (about 130 in all). In each nation you can research up to one era above the newest era you own in that nation. Every nation starts with one WW1 aircraft.
- **Achievements**: 30 achievements with progress bars.
- **Rewards**: XP and coins for kills, assists, damage, bases and winning. Assists add to your own score but never to the team score. Leaving a battle early forfeits the participation reward: you keep only what you earned.

## Maps, weather and time of day
Every mode lets the host pick the map (Countryside, Coastline, Pacific Islands, Desert, Winter, Alpine Valleys, Canyonlands, Farmland, Jungle Rivers, Arctic Sea, or random), its size (small / medium / large), the weather (clear, scattered clouds, overcast, rain, thunderstorm with lightning, snowfall, fog, or random) and night. Bad weather lowers visibility and brings turbulence; at night the bases and runways are lit.

## Tanks
Destroy battles have tanks from each team driving around their territory (era-appropriate models). Rifle-calibre rounds barely scratch them; heavy machine guns, cannon (best with AP rounds), rockets and bombs kill them. Each tank is worth 0.5 points.

## Flying
Gunnery assist (Profile settings, on by default): put the aim circle on the red lead marker and the instructor tracks it; the marker turns into a white FIRE cue when your guns are on target and in range. Arrows at the screen edge point to nearby enemies off screen. Bot skill can be set from Rookie to Ace.

The mouse-aim autopilot works like War Thunder's instructor: it flies the aircraft towards the aim circle with damped, rate-based inputs, keeps the angle of attack below the stall and eases off when the pilot is greying out. The manual pitch keys override all of that. The bank it uses follows how far the aim is off to the side: a small correction is a shallow bank, and only a big turn (or an aim that keeps sweeping, like a turning target) is flown on its side or rolled over.
- **Post-stall manoeuvres:** high-AoA jets (Su-27, MiG-29, F/A-18) and thrust-vectoring jets (F-22, Su-35, Su-57) can be hauled far past the stall with the manual pull: a Pugachev's Cobra (pull hard at ~400 km/h and let go) bleeds a lot of speed; holding it on a thrust-vectoring jet flips it into a Kulbit. Other aircraft simply stall.
- **G-forces:** above the pilot's tolerance the view narrows and greys (no G-suit before the jet age: ~4.5-5 G; G-suits: 5.5-7.5 G). Pull ~2 G beyond that and it builds up to G-LOC: the screen goes black and the pilot is unconscious for ~5 s. Strong negative G reddens the view. Bots feel G too.

## Cockpit view
Press C for the cockpit: an interior fixed to the aircraft with the real nose and wings ahead. WW1 open cockpits (ring-and-bead sight, gun breeches), WW2 framed canopies with reflector gunsights and round dials, early-jet gyro sights, and modern HUDs with multi-function displays. The instruments are live.

## Controls
All controls can be rebound in **Profile → Controls** (keys or mouse buttons). Defaults:
| | |
|---|---|
| Mouse | aim — the aircraft banks and pulls towards the circle (small moves = small, smooth corrections) |
| Left mouse | guns (and gun pods) |
| Right mouse (hold) | zoom in |
| V (hold) | look around |
| W / S | throttle; hold W at 100% for WEP or afterburner |
| A / D | roll (ramps in smoothly; let go and the aircraft holds that bank in a level turn until you move the mouse) |
| Q / E | rudder |
| Arrow down / up | manual pull / push: bypasses the autopilot's stall and G protection (stalls, spins, cobra) |
| Space | drop bombs (CCIP bomb sight: the pipper shows where they will hit, with the blast radius ring, time of fall and a RELEASE cue) |
| Z / H | flaps down / up a notch (combat, take-off, landing; too fast and they tear off) |
| B | air brake in flight (jets, dive bombers), wheel brakes on the ground |
| T | switch guns: all / machine guns only / cannons only |
| Middle mouse (hold) | keep the camera on your target |
| R | fire rockets |
| F | fire missile (wait for the lock tone) |
| X | flares |
| G / B | landing gear / wheel brakes (Realistic Mode) |
| C | chase / nose camera |
| Tab | scoreboard |
| Esc | pause / leave |

The crosshair colour can be changed in the profile settings.

## Realistic Mode
A checkbox in every game mode. You start on your team's airfield runway with the engine idling: throttle up and pull up at the speed the HUD shows. Raise the gear after take-off. Lower it to land; a gentle touchdown on the wheels (wings level, sink under ~6 m/s) is a landing, 6-9 m/s is a hard landing that damages the airframe, more is a crash. Stop at your own airfield for 12 seconds to refuel, rearm and repair. Airfields can be bombed: a team whose airfields are all destroyed can no longer take off. Bots take off from the runway too.

## Sound
Everything is synthesised in the browser (no recordings): piston engines buzz at their real cylinder firing frequency (rotary, inline and radial engines differ, multi-engine aircraft beat), jets have a roar, turbine whine and afterburner rumble, guns fire at their real rate of fire with a report per calibre (Gatling guns growl), distant sounds arrive late at the speed of sound and lose their highs, and nearby aircraft fly past with a Doppler shift.

## How the simulation works
- **Aircraft models** (`js/airframe.js`, `js/aircraft3d.js`): `airframe.js` is a strict registry with one explicit entry per aircraft and no class defaults. `Airframe.spec()` validates every entry and throws on any missing or contradictory property, such as canted fins without a cant angle, canards without a length, or an unknown intake profile. Entries hold published data (length, span, height, wing area: the root chord is computed from the wing area, and the fin height of tricycle aircraft from the height), the fuselage `fuselageLengthToWidthRatio` and depth ratio, `wingMountHeight` (0 low .. 1 high), wing planform / sweep / taper / dihedral, `intakeProfile` (`side_box`, `chin_scoop`, `nose_cone`, `cheek_crescent`, plus `ventral_box`, `wing_root`, `nacelle`, `none`) with real mouth sizes in metres, `tailConfiguration` (`single_vertical`, `twin_vertical_straight`, `twin_vertical_canted` with its `finCantDeg`, `t_tail`, `twin_endplate`, `twin_boom`), canards (`canardPresence`, `canardLength`, `canardSweep`, cockpit-relative offset), engines, cockpit and an explicit list of extras. Each entry also has a `fuselageArchitecture`, assigned from the real engine and tail layout by `node tools/audit_specs.mjs --write`. There are three: `SINGLE_TUBE` (one central fuselage); `TWIN_NACELLE_DECK` (F-15, F/A-18E, MiG-29, Su-27 family: a narrow cockpit pod and two separate engine tunnels from the intake mouths to the nozzles, joined by a flat deck, with the twin fins on the tunnel tops and a sharp LEX shelf when `lexPresence` is set); and `CHINED_STEALTH` (F-22, Su-57: a hard-edged hexagonal section whose chine runs from the nose through caret intakes into the wing roots). `aircraft3d.js` builds closed solids only (lofted superellipse bodies, NACA-section surfaces, closed lathe rings) and runs an explicit anomaly checklist; for example, `side_box` intakes flatten the fuselage sides into hard panels. Each rule that fires is logged in `Airframe.anomalies[id]`. `tools/tests/meshcheck.mjs` checks the registry (complete, valid, missing properties rejected) and that every part of every aircraft is watertight and faces outwards (`LOG=f22a,...` prints the checklist). Period details: open / framed / bubble / glazed cockpits with pilots, navigation lights, anti-glare panels, RAF roundel types and fin flashes, French fin flashes, US star-and-bar, outlined hinomaru.
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
node tools/tests/cdp.mjs tools/tests/gallery.mjs   # aircraft model sheets (NATION= or IDS=; CLOSE=1 cockpit close-ups, CAM=x,y,z view direction, K= distance, TZ= target along the length)
node tools/tests/cdp.mjs tools/tests/meshcheck.mjs # airframe registry valid + every part watertight and outward-facing (LOG=ids prints the anomaly checklist)
node tools/audit_specs.mjs                         # configuration audit: every airframe vs an independent reference of its real layout + geometry rules
node tools/tests/mp.mjs                            # two tabs: host + join code + battle (needs internet)
```
Screenshots go to `tools/tests/shots/`.
