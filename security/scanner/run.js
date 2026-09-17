#!/usr/bin/env node
// Security assessment: static rules + dynamic browser tests -> report + deploy gate.
// Usage: node scanner/run.js [--app-dir ..] [--dynamic results/dynamic.json]
const fs = require('fs');
const path = require('path');
const rules = require('./rules');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const APP_DIR = path.resolve(arg('--app-dir', path.join(__dirname, '..', '..')));
const DYN = path.resolve(arg('--dynamic', path.join(__dirname, '..', 'results', 'dynamic.json')));
const OUT = path.resolve(path.join(__dirname, '..', 'results'));
const ACCEPT = path.join(__dirname, '..', 'accepted-risks.json');
const SKIP = new Set(['.git', '.github', 'node_modules', 'qa', 'security', '_site', 'results', 'test-results', 'qa-report']);
const ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const ICON = { critical: '🟥', high: '🟧', medium: '🟨', low: '🟦', info: '⬜' };

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    if (SKIP.has(d.name)) return [];
    const p = path.join(dir, d.name);
    return d.isDirectory() ? files(p) : /\.(html?|js|mjs)$/i.test(d.name) ? [p] : [];
  });
}

// ---- static analysis
const findings = [];
for (const f of files(APP_DIR)) {
  const src = fs.readFileSync(f, 'utf8'), rel = path.relative(APP_DIR, f), isHtml = /\.html?$/i.test(f);
  for (const r of rules) {
    if (r.appliesTo === 'html' && !isHtml) continue;
    const hits = r.check(src);
    if (hits.length) findings.push({ ...r, source: 'static', location: hits.map(h => h.line ? `${rel}:${h.line}` : rel), evidence: hits.map(h => h.evidence) });
  }
}

// ---- dynamic tests (Playwright JSON). Title format: "SEC-1xx [severity] Title"
const controls = [];
if (fs.existsSync(DYN)) {
  const walk = (s) => [...(s.specs || []).flatMap(sp => sp.tests.map(t => ({ sp, t }))), ...(s.suites || []).flatMap(walk)];
  const rep = JSON.parse(fs.readFileSync(DYN, 'utf8'));
  for (const { sp, t } of rep.suites.flatMap(walk)) {
    const m = sp.title.match(/^(SEC-\d+)\s+\[(\w+)\]\s+(.*)$/); if (!m) continue;
    const res = t.results[t.results.length - 1] || {};
    const meta = Object.fromEntries((t.annotations || []).map(a => [a.type, a.description]));
    const status = res.status === 'passed' ? 'pass' : res.status === 'skipped' ? 'skipped' : 'fail';
    controls.push({ id: m[1], severity: m[2], title: m[3], status });
    if (status === 'fail') {
      const msg = ((res.errors || [])[0] || res.error || {}).message || '';
      findings.push({ id: m[1], severity: m[2], title: m[3], source: 'dynamic', owasp: meta.owasp || '', iso: meta.iso || '',
        why: meta.why || '', fix: meta.fix || '', location: [path.basename(sp.file)], evidence: [msg.replace(/\u001b\[[0-9;]*m/g, '').split('\n').filter(Boolean)[0].replace(/^Error:\s*/, '').slice(0, 300)] });
    }
  }
} else {
  console.warn('No dynamic test results found at ' + DYN + ' — static checks only.');
}

// ---- risk acceptance register
const accepted = fs.existsSync(ACCEPT) ? JSON.parse(fs.readFileSync(ACCEPT, 'utf8')).accepted || [] : [];
const today = new Date().toISOString().slice(0, 10);
for (const f of findings) {
  const a = accepted.find(x => x.id === f.id);
  if (a && a.expires >= today) f.accepted = a;
  else if (a) f.expired = a;
}
findings.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.id.localeCompare(b.id));
const blocking = findings.filter(f => (f.severity === 'critical' || f.severity === 'high') && !f.accepted);
const count = (s) => findings.filter(f => f.severity === s && !f.accepted).length;

// ---- report
const app = path.basename(APP_DIR);
let md = `# Security assessment — ${app}\n\n`;
md += `**Result:** ${blocking.length ? `❌ BLOCKED — ${blocking.length} open critical/high finding(s)` : '✅ PASSED — no open critical or high findings'}  \n`;
md += `**Date:** ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC  \n`;
md += `**Scope:** ${files(APP_DIR).map(f => path.relative(APP_DIR, f)).join(', ')} · ${rules.length} static rules · ${controls.length} dynamic tests\n\n`;
md += `| Severity | Open | Accepted |\n|---|---|---|\n` + Object.keys(ORDER).map(s => `| ${ICON[s]} ${s} | ${count(s)} | ${findings.filter(f => f.severity === s && f.accepted).length} |`).join('\n') + '\n\n';
md += `## Findings\n\n`;
if (!findings.length) md += '_None._\n\n';
for (const f of findings) {
  md += `### ${ICON[f.severity]} ${f.id} · ${f.severity.toUpperCase()} · ${f.title}${f.accepted ? ' _(risk accepted)_' : ''}\n\n`;
  if (f.why) md += `**Why it matters:** ${f.why}  \n`;
  md += `**Where:** ${f.location.slice(0, 6).join(', ')}${f.location.length > 6 ? ` +${f.location.length - 6} more` : ''}  \n`;
  if (!f.summaryOnly || f.evidence.length) md += `**Evidence:** ${f.evidence.slice(0, 4).map(e => '`' + String(e).replace(/`/g, "'") + '`').join(', ')}  \n`;
  if (f.fix) md += `**Recommended fix:** ${f.fix}  \n`;
  md += `**References:** OWASP ${f.owasp || '—'} · ISO/IEC 27001:2022 ${f.iso || '—'}  \n`;
  if (f.accepted) md += `**Accepted by:** ${f.accepted.owner} until ${f.accepted.expires} — ${f.accepted.reason}  \n`;
  if (f.expired) md += `**⚠️ Risk acceptance expired on ${f.expired.expires}** — review again.  \n`;
  md += '\n';
}
if (controls.length) {
  md += `## Dynamic security tests\n\n| Test | Severity | Result |\n|---|---|---|\n`;
  md += controls.map(c => `| ${c.id} ${c.title} | ${c.severity} | ${c.status === 'pass' ? '✅ pass' : c.status === 'skipped' ? '➖ skipped' : '❌ fail'} |`).join('\n') + '\n\n';
}
md += `---\nGate rule: deploy is blocked by any **critical** or **high** finding not listed in \`security/accepted-risks.json\`. Medium, low and info findings are reported but do not block.\n`;

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'security-report.md'), md);
fs.writeFileSync(path.join(OUT, 'security-findings.json'), JSON.stringify({ app, date: new Date().toISOString(), blocking: blocking.length, findings, controls }, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
console.log(md);
process.exit(blocking.length ? 1 : 0);
