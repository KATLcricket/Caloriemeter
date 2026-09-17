# Calorie Meter — Security assessment

An automated security analyst that runs on every change (and every Monday),
writes a report, and **blocks deployment if it finds a critical or high issue.**

## What it does

| Part | How it works |
|---|---|
| **Static review** (`scanner/rules.js`) | Reads the app's code for known risky patterns: hard-coded passcodes, secret keys, missing Content Security Policy, dynamic code execution, unverified third-party scripts, insecure links, browser-only access control, third-party data sharing |
| **Attack simulation** (`tests/security.spec.js`) | Opens the real app and tries attacks: tampered backup files, tampered saved data, script in form fields, broken/hostile backups, spreadsheet formula injection, data leaving the device, data theft if code were ever injected |
| **Report + gate** (`scanner/run.js`) | Combines both into `results/security-report.md`, rated critical / high / medium / low / info and mapped to OWASP Top 10 (2021) and ISO/IEC 27001:2022 Annex A. Exits with failure on any open critical or high finding |
| **Risk register** (`accepted-risks.json`) | Lets you consciously accept a finding with an owner, reason and expiry date. Expired acceptances block again |

## Where to see the report

GitHub → **Actions** → open a run:
- **Summary page**: the full report is shown there, scroll down.
- **Artifacts → security-report**: download for the Markdown report, a JSON file of findings, and screenshots. Kept 90 days.

## Run it on your laptop

    cd security
    npm ci
    npm run setup      # first time only
    npm run assess     # tests + report; ends with PASSED or BLOCKED

## Accepting a risk (instead of fixing it)

Add an entry to `accepted-risks.json`, for example:

    {
      "accepted": [
        { "id": "SEC-011", "owner": "Vishal Sinha", "reason": "Google Fonts IP exposure is acceptable for a personal app", "expires": "2027-03-31" }
      ]
    }

Only critical and high findings block, so accept low/medium ones only for a cleaner report.

## Adding a check

- **Code pattern:** add a rule object to `scanner/rules.js` (id, title, severity, owasp, iso, why, fix, check).
- **Attack scenario:** add a test to `tests/security.spec.js` titled `SEC-1xx [severity] What must be true`.

## Limits

This is automated assurance for a small single-file app, not a penetration test.
It checks the patterns and attacks written into it; it does not review business logic,
the GitHub account itself, or the phone/browser. Keep GitHub two-factor authentication on.
