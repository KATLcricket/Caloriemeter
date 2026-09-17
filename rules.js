// Static security rules. Each rule looks at the app's source and returns findings.
// Severity: critical | high | medium | low | info
// References: OWASP Top 10 (2021) and ISO/IEC 27001:2022 Annex A controls.

const line = (src, idx) => src.slice(0, idx).split('\n').length;
const findAll = (src, re) => { const out = []; let m; const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); while ((m = g.exec(src))) out.push(m); return out; };

module.exports = [
  {
    id: 'SEC-001', title: 'Hard-coded passcode or password in client code',
    severity: 'high', owasp: 'A07 Identification & Authentication Failures', iso: 'A.5.17 Authentication information; A.8.5 Secure authentication',
    why: 'Anything in a web page can be read by every visitor (View Source). A passcode stored in the page does not protect anything.',
    fix: 'Check passcodes on a server (e.g. a Supabase Edge Function) or use real sign-in; never ship the secret in the page.',
    check: (src) => findAll(src, /(?:const|let|var)\s+([A-Z_]*(?:PASS(?:WORD|CODE)?|ADMIN_CODE|TEAM_CODE|PIN|SECRET)[A-Z_]*)\s*=\s*["'`]([^"'`]{3,})["'`]/gi)
      .map(m => ({ line: line(src, m.index), evidence: `${m[1]} = "${m[2].slice(0, 2)}…" (${m[2].length} chars)` })),
  },
  {
    id: 'SEC-002', title: 'Secret API key or private token in client code',
    severity: 'critical', owasp: 'A02 Cryptographic Failures', iso: 'A.8.24 Use of cryptography; A.5.17 Authentication information',
    why: 'Private keys in a public page give anyone full access to the connected service.',
    fix: 'Revoke the key now, move the call to a server-side function, and keep only publishable keys in the page.',
    check: (src) => [
      /sk_live_[0-9a-zA-Z]{16,}/g, /sb_secret_[0-9a-zA-Z_-]{10,}/g, /AKIA[0-9A-Z]{16}/g, /ghp_[0-9A-Za-z]{30,}/g,
      /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g, /AIza[0-9A-Za-z_-]{35}/g,
      /eyJhbGciOi[^"'`\s]{20,}\.[^"'`\s]*cm9sZSI6InNlcnZpY2Vfcm9sZS[^"'`\s]*/g, // Supabase service_role JWT
    ].flatMap(re => findAll(src, re)).map(m => ({ line: line(src, m.index), evidence: m[0].slice(0, 12) + '…' })),
  },
  {
    id: 'SEC-003', title: 'Publishable backend key in client code (depends on database rules)',
    severity: 'info', owasp: 'A01 Broken Access Control', iso: 'A.8.3 Information access restriction',
    why: 'Publishable/anon keys are meant to be public, so safety depends entirely on the database access rules (Row Level Security).',
    fix: 'Confirm Row Level Security is on for every table and that anonymous users can only do what the app intends.',
    check: (src) => findAll(src, /sb_publishable_[0-9A-Za-z_-]{10,}|eyJhbGciOi[^"'`\s]{20,}\.[^"'`\s]*cm9sZSI6ImFub24i[^"'`\s]*/g)
      .map(m => ({ line: line(src, m.index), evidence: m[0].slice(0, 16) + '…' })),
  },
  {
    id: 'SEC-004', title: 'No Content Security Policy',
    severity: 'medium', owasp: 'A05 Security Misconfiguration', iso: 'A.8.9 Configuration management; A.8.26 Application security requirements',
    why: 'A CSP limits what injected script can do — for example, it can stop stolen data being sent to another website.',
    fix: 'Add a <meta http-equiv="Content-Security-Policy"> tag (GitHub Pages cannot send security headers).',
    appliesTo: 'html',
    check: (src) => /http-equiv=["']Content-Security-Policy["']/i.test(src) ? [] : [{ line: 1, evidence: 'no CSP meta tag found' }],
  },
  {
    id: 'SEC-005', title: 'Dynamic code execution (eval / new Function / document.write)',
    severity: 'high', owasp: 'A03 Injection', iso: 'A.8.28 Secure coding',
    why: 'These turn text into running code; if any of that text can be influenced, it becomes code injection.',
    fix: 'Replace with JSON.parse or normal functions.',
    check: (src) => findAll(src, /\beval\s*\(|new\s+Function\s*\(|document\.write\s*\(|setTimeout\s*\(\s*["'`]|setInterval\s*\(\s*["'`]/g)
      .map(m => ({ line: line(src, m.index), evidence: m[0] })),
  },
  {
    id: 'SEC-006', title: 'Third-party script loaded without integrity check (SRI)',
    severity: 'medium', owasp: 'A08 Software & Data Integrity Failures', iso: 'A.8.30 Outsourced development; A.8.28 Secure coding',
    why: 'If the CDN is compromised, altered code runs inside your app with full access to its data.',
    fix: 'Add integrity="sha384-…" and crossorigin="anonymous", or self-host the file.',
    appliesTo: 'html',
    check: (src) => findAll(src, /<script\b[^>]*\bsrc=["'](https?:)?\/\/[^"']+["'][^>]*>/gi)
      .filter(m => !/\bintegrity=/i.test(m[0])).map(m => ({ line: line(src, m.index), evidence: (m[0].match(/src=["']([^"']+)/i) || [])[1] })),
  },
  {
    id: 'SEC-007', title: 'Insecure http:// resource',
    severity: 'medium', owasp: 'A02 Cryptographic Failures', iso: 'A.8.24 Use of cryptography',
    why: 'Files fetched over plain http can be altered in transit.',
    fix: 'Use https://.',
    check: (src) => findAll(src, /(?:src|href|fetch\(|url\()\s*=?\s*["'(]?http:\/\/(?!localhost|127\.0\.0\.1|www\.w3\.org)[^"')\s]+/gi)
      .map(m => ({ line: line(src, m.index), evidence: m[0].slice(0, 80) })),
  },
  {
    id: 'SEC-008', title: 'Link opens a new tab without rel="noopener"',
    severity: 'low', owasp: 'A05 Security Misconfiguration', iso: 'A.8.28 Secure coding',
    why: 'The opened page can redirect your app\'s tab (reverse tabnabbing).',
    fix: 'Add rel="noopener noreferrer", or pass "noopener" to window.open.',
    check: (src) => [
      ...findAll(src, /<a\b[^>]*target=["']_blank["'][^>]*>/gi).filter(m => !/noopener/i.test(m[0])),
      ...findAll(src, /window\.open\s*\([^;]*\)/g).filter(m => !/noopener/.test(m[0])),
    ].map(m => ({ line: line(src, m.index), evidence: m[0].slice(0, 80) })),
  },
  {
    id: 'SEC-009', title: 'Access control decided only by a browser storage flag',
    severity: 'high', owasp: 'A01 Broken Access Control', iso: 'A.8.3 Information access restriction; A.8.5 Secure authentication',
    why: 'Anyone can set localStorage values in their own browser, so a flag like "admin=1" grants the role to whoever sets it.',
    fix: 'Enforce roles on the server; treat the browser flag as display-only.',
    check: (src) => findAll(src, /localStorage\.(?:getItem|setItem)\(\s*["'][^"']*(?:admin|gate|auth|role|logged|unlock)[^"']*["']/gi)
      .map(m => ({ line: line(src, m.index), evidence: m[0] })),
  },
  {
    id: 'SEC-010', title: 'HTML built from strings (innerHTML) — review for escaping',
    severity: 'info', owasp: 'A03 Injection', iso: 'A.8.28 Secure coding',
    why: 'Every value placed into innerHTML must be escaped. The dynamic injection tests check this in practice.',
    fix: 'Escape every stored value (esc()) or use textContent.',
    summaryOnly: true,
    check: (src) => { const n = findAll(src, /\.innerHTML\s*=|insertAdjacentHTML\s*\(/g).length; return n ? [{ line: 0, evidence: `${n} places build HTML from strings` }] : []; },
  },
  {
    id: 'SEC-011', title: 'Data sent to third-party servers on load',
    severity: 'low', owasp: 'A05 Security Misconfiguration', iso: 'A.5.34 Privacy and protection of PII; A.8.12 Data leakage prevention',
    why: 'Loading fonts or scripts from other companies reveals each visitor\'s IP address and visit time to them.',
    fix: 'Self-host fonts/scripts, or accept this as a known low risk.',
    appliesTo: 'html',
    check: (src) => {
      const hosts = new Set(findAll(src, /<(?:link|script|img)\b[^>]*(?:href|src)=["']https:\/\/([^/"']+)/gi).map(m => m[1]));
      return [...hosts].map(h => ({ line: line(src, src.indexOf(h)), evidence: h }));
    },
  },
];
