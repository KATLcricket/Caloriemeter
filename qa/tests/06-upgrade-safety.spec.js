const { test, expect } = require('@playwright/test');
const { openApp, db, tab } = require('./harness');
test('existing data with apostrophes, lifting data and odd entries survives an upgrade', async ({ context }) => {
  const seed = { settings:{k:2100,p:150,c:220,f:60,water:3500,sets:18}, recent:[], custom:[{n:"Amma's sambar",u:'bowl',q:1,p:5,c:20,f:4,k:136,t:'Mine'}],
    days:{'2026-09-15':[{n:"Amma's sambar",u:'bowl',qty:1.5,meal:'Lunch',p:7.5,c:30,f:6,k:204},{n:'Old thing',u:'g',qty:10,meal:'Brunch',p:1,c:1,f:1,k:10}]},
    water:{'2026-09-15':750}, lift:{ unit:'kg', workouts:[{ name:"Push day", startedAt: 1757900000000, endedAt: 1757903600000, ex:[{n:'Bench Press',sets:[{kg:60,reps:8,done:true}]}] }] } };
  const { page, errors } = await openApp(context, { seed });
  for (const v of ['home','today','train','trends','set']) await tab(page, v);
  const d = await db(page);
  expect(errors).toEqual([]);
  expect(d.days['2026-09-15'].map(e=>e.n)).toEqual(["Amma's sambar",'Old thing']);
  expect(d.custom[0].n).toBe("Amma's sambar");
  expect(d.settings.water).toBe(3500);
  expect(d.lift.workouts[0].ex[0].sets[0]).toEqual({kg:60,reps:8,done:true});
});
