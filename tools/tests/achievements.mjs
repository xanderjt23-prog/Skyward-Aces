// node tools/tests/cdp.mjs tools/tests/achievements.mjs : achievement rewards (and the one-off payment for ones unlocked
// before rewards existed), multiplayer-only K/D and win rate, the new statistics, and the profile / achievements pages
import path from 'path';
export default async function (t) {
  await t.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  const out = await t.eval(`(() => { localStorage.clear(); Profile.reset(); const p = Profile.get(), log = [];
    const base = { left: false, tanks: 0, assists: 0, basePoints: 0, damage: 0, era: 6, minutes: 10, waves: 0, score: 0, nation: 'usa', plane: 'f16c', basesDestroyed: 0, bigBases: 0, crewKills: 0, wingKills: 0, fires: 0, crashKills: 0, missileKills: 0, giantKills: 0 };
    const c0 = p.coins; let r = Profile.applyBattle(Object.assign({}, base, { kills: 4, deaths: 1, won: true, mode: 'dogfight', online: false, night: true, size: 'massive', evadedRadar: 1, bombKg: 2000, oldSchool: true }));
    log.push('singleplayer win: ' + r.achievements.map(a => a.id + '(t' + a.tier + ')').join(' ') + ' | coins +' + (p.coins - c0) + ' (battle ' + r.coins + ')');
    log.push('stats sp ' + [p.stats.spBattles, p.stats.spWins, p.stats.spKills, p.stats.spDeaths].join('/') + ' mp ' + [p.stats.mpBattles || 0, p.stats.mpWins || 0, p.stats.mpKills || 0, p.stats.mpDeaths || 0].join('/'));
    r = Profile.applyBattle(Object.assign({}, base, { kills: 2, deaths: 2, won: false, mode: 'destroy', online: true }));
    log.push('multiplayer loss: mp ' + [p.stats.mpBattles, p.stats.mpWins || 0, p.stats.mpKills, p.stats.mpDeaths].join('/'));
    // an old save: unlocked but never paid
    p.ach.k25 = Date.now(); delete p.achPaid.k25; const c1 = p.coins; Profile.checkAchievements(); log.push('retro payment for k25: +' + (p.coins - c1));
    Profile.checkAchievements(); log.push('paid only once: +' + (p.coins - c1 - ACH_REWARD[2].coins));
    for (const id of ['basics', 'takeoff', 'landing', 'turns', 'rolls', 'reversals']) Profile.tutorialDone(id); log.push('after maneuver tutorials: ' + (p.ach.tut_man ? 'Aerobat unlocked' : 'no Aerobat') + ', tutorials ' + p.stats.tutorials);
    UI.open('profile'); const rows = [...document.querySelectorAll('.stat')].map(e => e.textContent.trim()).filter(x => /K\\/D|Win rate|Singleplayer|Multiplayer/.test(x));
    log.push('profile: ' + rows.join(' | '));
    return log.join('\\n'); })()`);
  console.log(out);
  await t.shot('profile-stats');
  await t.eval("UI.open('achievements'); 1"); await t.shot('achievements');
}
