// Independent reference formulas, written from the published equations — not copied from the app.
const katch = (w, bf) => 370 + 21.6 * (w * (1 - bf / 100));
const mifflin = (w, h, a, sex) => 10 * w + 6.25 * h - 5 * a + (sex === 'm' ? 5 : -161);
const navyMale = (h, neck, waist) => 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(h)) - 450;
const navyFemale = (h, neck, waist, hip) => 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.221 * Math.log10(h)) - 450;
const deurenberg = (w, h, a, sex) => 1.2 * (w / (h / 100) ** 2) + 0.23 * a - 10.8 * (sex === 'm' ? 1 : 0) - 5.4;
module.exports = { katch, mifflin, navyMale, navyFemale, deurenberg };
