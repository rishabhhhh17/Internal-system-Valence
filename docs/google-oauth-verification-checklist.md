# Google OAuth Verification — Pre-submission Checklist for the Valence Team

**Prepared for:** The Valence Growth Partners team
**Prepared on:** 21 May 2026
**Status:** Blocked on team decisions (listed below)

---

## Why this matters

ValenceOS uses Google sign-in plus access to each user's Gmail metadata (from / to / subject lines only — never email bodies) and Google Calendar. For the internal Valence team on the `valencegrowth.com` Workspace, this works today with no verification needed.

For any external client (a different firm we sell to), Google requires the app to be verified before they can sign in without seeing an "unverified app" warning. **Verification is mandatory before we onboard a single paying client.**

This document lists everything the team needs to produce before Claude can drive the Google Cloud Console and submit the application.

---

## The realistic timeline

- Team decisions + content prep: **~1 week**
- Google review of standard (sensitive) scopes: **~2–3 weeks**
- CASA security audit for the restricted Gmail scope: **4–8 weeks, parallel track**
- **Total to fully verified: ~2 months from today**

There is no way to compress this. Most of the wait is Google's review queue and the third-party security audit, neither of which we control.

---

## Decisions the team needs to make

| # | Decision | Why it blocks verification | Owner | Recommended |
|---|---|---|---|---|
| 1 | Final product name | Goes into the OAuth consent screen end users see. Cannot be changed easily after submission. | Founders | Keep "ValenceOS" for v1, rebrand later as a separate workstream |
| 2 | Domain we own (Google rejects `vercel.app` and similar shared platforms) | Required for the Authorized Domains field. App must be deployed to this domain. | Rishabh + IT | Use a subdomain like `app.valencegrowth.com` — no new domain purchase needed |
| 3 | Whether to include the Gmail metadata scope in v1 | Gmail metadata is a "restricted scope" — triggers a $10–15k CASA security audit (4–8 weeks). Calendar alone does not. | Founders | Drop Gmail from v1, use Calendar only. Team logs email signals manually. Add Gmail in v2 once CASA is funded. |
| 4 | Legal sign-off on privacy policy + ToS | Both must be live and accessible before submission. Google reads them. | Legal counsel (Trishant?) | Approve a draft Claude prepares, deploy to `/privacy` and `/terms` |
| 5 | Logo file (final version) | Required for branding. 120×120 PNG minimum, transparent background preferred. | Design / Founders | Reuse the existing `valencegrowth.com` logo if available |
| 6 | CASA assessor vendor (only if Gmail scope is in v1) | Google maintains a list of approved assessors. Engagement is a contract. | Founders + Legal | Get quotes from Bishop Fox, Leviathan Security, NCC Group |

---

## Artifacts to produce (after decisions are made)

| Artifact | What it is | Who produces | Where it lives |
|---|---|---|---|
| Domain or subdomain DNS setup | A or CNAME record pointing the chosen domain at Vercel | Rishabh + IT (or domain registrar) | DNS panel |
| Domain verification in Google Search Console | A TXT record proving domain ownership | Rishabh | Search Console |
| App deployment to that domain | Vercel project bound to the new domain | Rishabh | Vercel |
| Privacy policy page | Public webpage covering each Google scope explicitly | Claude drafts → Legal reviews → Rishabh deploys | `/privacy` on the app |
| Terms of service page | Public webpage covering acceptable use | Claude drafts → Legal reviews → Rishabh deploys | `/terms` on the app |
| App logo | 120×120 PNG, transparent background | Design / Founders | Uploaded in Google Cloud Console |
| Demo video | 3–5 min YouTube unlisted video: sign-in flow, the consent screen with each scope, what each scope is used for, how data is handled | Rishabh records, Founders review | YouTube unlisted link |
| Scope justification writeups | One paragraph per scope explaining why the app needs it | Claude drafts → Founders approve | Submitted in Cloud Console |
| In-product privacy notice | Short copy on the consent screen explaining data use | Claude drafts → Founders approve | Submitted in Cloud Console |
| CASA assessment report (Gmail-in-v1 only) | Signed letter from assessor confirming security review passed | CASA vendor → Founders sign engagement | Uploaded in Cloud Console |

---

## What Claude will do once decisions are made

These steps are automated through Claude in Chrome — no manual clicking by the team:

1. Open Google Cloud Console, navigate to Branding
2. Fill app name, support email, homepage URL, privacy URL, terms URL
3. Add authorized domain
4. Upload the logo file
5. Navigate to Data Access, configure each requested scope with the prepared justification
6. Navigate to Verification Center, upload demo video link and any additional artifacts
7. Click Submit for verification
8. Monitor for Google's response (typically 3–5 business days for first feedback)
9. Address any pushback from Google's reviewer

---

## What's NOT in scope for this checklist

- Building Phase 2 auto-capture (Gmail / Calendar Edge Functions) — separate workstream
- Building remaining Phase 8 UI surfaces — separate workstream
- Hiring the CASA vendor — Founders' call, not a Claude-can-automate task
- Recording the demo video — Rishabh needs to do this on a real machine

---

## Bottom line — what to do this week

Three founder-owned decisions:

1. **Pick the name** (or confirm ValenceOS stays)
2. **Pick the domain** (recommended: `app.valencegrowth.com`)
3. **Decide Gmail-in-v1 or not** (recommended: not — defer to v2 with CASA)

Once those three answers are in, Claude takes the next week to draft privacy policy, ToS, scope justifications, and the demo video script. Founders approve. Rishabh records the video. Submission happens. Google reviews for 2–3 weeks. Verified for non-Gmail use. Gmail added later via CASA.

**Total elapsed time from today to first external client:** about 1 month if Gmail is dropped from v1, about 2 months if included.
