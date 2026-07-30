# Tech Stack Compliance Checklist

**For:** Valence Growth Partners / Orbit
**Purpose:** Map the legal requirements in the privacy policy to specific engineering tasks. This is what needs to be true in code and infrastructure for the policy to be honest.

---

## 1. Data subject rights infrastructure

### 1.1 Access request endpoint
Build an internal admin endpoint that, given a person's email, exports every piece of personal data we hold about them across all systems (Supabase tables, Gmail metadata logs, Calendar logs, Knowledge Base notes that reference them).

Output format: machine-readable JSON plus a human-readable PDF summary.

SLA: respond within 30 days for DPDP requests, 30 days (extendable to 60) for GDPR, 45 days (extendable to 90) for CCPA.

Required by: DPDP Act, GDPR Article 15, CCPA Right to Know.

### 1.2 Deletion endpoint
Build an internal admin endpoint that, given a person's email, deletes or anonymises their personal data across all systems, with exceptions for legal retention (closed transactions kept for 7 years, etc.).

Important: do not hard-delete data that is subject to legal-retention obligations. Instead, anonymise the identifying fields and keep the transactional record.

Required by: DPDP Act, GDPR Article 17, CCPA Right to Delete.

### 1.3 Correction endpoint
Allow admins to correct inaccurate personal data on request. This is mostly a UI affordance on the People CRM that lets a designated person at Valence update a record and log who changed what when.

Required by: DPDP Act, GDPR Article 16, CCPA Right to Correct.

### 1.4 Audit log
Every data subject request must be logged with: who requested it, when, what action was taken, who actioned it, and when it was completed. Store this for at least 24 months (CCPA requires 24 months minimum; we'll do 7 years to align with our other retention).

Required by: CCPA enforcement regulations.

---

## 2. Consent and notice

### 2.1 Privacy notice on every collection point
Wherever we collect personal data (contact form, newsletter signup, deal intake form, recruitment form), display a short notice with a link to the full privacy policy. Notice must be in plain language.

For India, the DPDP Rules require the notice to be available in English and the 22 scheduled languages of India. For v1, we can offer English and Hindi, and add others as resources permit.

### 2.2 Cookie consent banner
Implement a cookie consent banner on the public-facing website that:
- Is shown to all visitors before any non-essential cookie is set.
- Has equally prominent "Accept all", "Reject all", and "Customise" options. (No dark patterns. The CPPA has fined firms for asymmetric design.)
- Honours Global Privacy Control (the `Sec-GPC` HTTP header) and treats it as a valid opt-out signal.
- Persists the user's choice and respects it on subsequent visits.

Required by: GDPR ePrivacy, CCPA opt-out preference signals, and 2026 CPPA regulations.

### 2.3 Consent withdrawal mechanism
Provide an easy way for anyone to withdraw consent or opt out of communications. The "unsubscribe" link in our emails counts. Add a "Manage your data" page on the website with a contact form for rights requests.

---

## 3. Data minimisation in Orbit

### 3.1 Never store email bodies
The Gmail ingestion worker must extract only metadata (from, to, cc, timestamp, subject) and discard the body. This is already in the Orbit handoff doc but flagging it here as a hard legal requirement.

Rationale: the bodies of business emails frequently contain sensitive transaction data, third-party personal data, and confidential information we shouldn't be retaining beyond what is necessary.

### 3.2 Summarise, do not record
For meetings, store the title, attendees, duration, and any user-provided notes. Do not record or transcribe meetings without explicit consent from all participants.

### 3.3 Field-level retention
Add a `delete_after` column to interaction logs and similar high-volume tables. A nightly job purges rows past their retention date. Default retention: 7 years for transaction-related, 24 months for website logs.

---

## 4. Vendor and subprocessor management

### 4.1 Data Processing Agreements (DPAs)
Sign a written DPA with every vendor that processes personal data on our behalf:
- Supabase
- Vercel
- Google Workspace (Google's standard DPA)
- Google Gemini API (verify the API's data usage terms exclude training)
- Slack
- Any enrichment provider we add later

Required by: GDPR Article 28, DPDP Act Section 8(3), CCPA service provider provisions.

### 4.2 Subprocessor list
Maintain a list of all subprocessors, updated when changes occur. Publish it (or make it available on request) per our Privacy Policy commitment.

### 4.3 Standard Contractual Clauses for international transfers
Where vendors process EEA/UK data outside the EEA/UK, the DPA must include the European Commission's Standard Contractual Clauses (the 2021 version) and the UK International Data Transfer Agreement.

Most major vendors (Google, Vercel, Supabase) include these by default. Verify on each.

### 4.4 Verify Gemini terms specifically
The Gemini API has different terms depending on which tier we use. The "Google AI Studio" tier and the "Vertex AI" tier have different data usage commitments. We need the Vertex AI or paid tier where Google contractually commits not to use our prompts to train their general models.

Action: confirm we are on the paid/Vertex tier and document this in our records.

---

## 5. Security baseline

### 5.1 Encryption
- Data at rest: ensure Supabase encryption at rest is enabled (it is by default on the paid tier).
- Data in transit: TLS 1.2+ on all endpoints. No HTTP. HSTS header set on the website.

### 5.2 Access controls
- Multi-factor authentication required for all Valence team members accessing Orbit.
- Role-based access in Supabase using Row Level Security policies. Junior team members should not have access to senior-only deal data.
- Audit logging in Supabase enabled.

### 5.3 Breach detection and response
- Set up monitoring on Supabase for unusual access patterns.
- Document a written incident response plan that includes:
  - Detection and triage
  - Containment
  - Notification to the Data Protection Board of India within 72 hours of becoming aware of a personal data breach
  - Notification to EU/UK supervisory authorities within 72 hours where the breach poses a risk to individuals
  - Notification to affected individuals "without undue delay" where the breach is likely to result in high risk
  - Notification to affected California residents per CCPA breach notification rules

Required by: DPDP Act Section 8(6), GDPR Articles 33 and 34, CCPA breach provisions.

### 5.4 Periodic review
Plan annual security reviews. For a firm our size, a full SOC 2 audit is overkill in v1, but document our security controls in a written information security policy.

---

## 6. AI-specific requirements

### 6.1 No automated decisions with legal effects
The Orbit AI chat layer is informational. It surfaces information and helps team members decide. It does not make any decision on its own that has legal effect on any external party (no automated employment decisions, no automated credit decisions, no automated denial of service).

Document this position. If we ever build a feature that does make automated decisions affecting individuals, we need:
- Human-in-the-loop review
- Pre-use notice
- Opt-out right (CCPA / CPPA ADMT regulations effective Jan 1, 2026)
- Right to appeal

### 6.2 AI grounding requirement (already in the Orbit handoff)
The AI never invents personal data. This is both a product principle and a legal safeguard, because under the GDPR and DPDP Act, fabricating data about a person is a form of inaccurate processing that violates the accuracy principle. The "AI never answers from its own knowledge, only from tool results" rule in the Orbit handoff is what implements this.

### 6.3 No third-party AI training
Ensure all AI vendor contracts prohibit the vendor from using our prompts and outputs to train their general models.

---

## 7. Record-keeping

### 7.1 Record of Processing Activities (ROPA)
Maintain a written record of processing activities, listing:
- What personal data we process
- The purposes
- The legal basis (per GDPR taxonomy)
- The categories of recipients
- Retention periods
- International transfers and safeguards
- Security measures

Required by: GDPR Article 30. Even though it's a GDPR-specific obligation, having one is good practice and helps with DPDP and CCPA compliance too.

Practical form: a single spreadsheet or Notion doc, kept up to date as we add features and vendors.

### 7.2 Data Protection Impact Assessment (DPIA)
Before launching Orbit's relationship intelligence layer (which is a substantial new processing activity using AI), conduct a written DPIA covering:
- Description of the processing
- Necessity and proportionality
- Risks to individuals
- Mitigations

Required by: GDPR Article 35 for high-risk processing. Good practice under DPDP for what would qualify as Significant Data Fiduciary processing.

### 7.3 Significant Data Fiduciary status
As of now Valence is unlikely to be designated a Significant Data Fiduciary under the DPDP Act (the designation is based on volume of data, sensitivity, risks, and economic significance). If we are designated in future, additional obligations apply (annual DPIA, independent audit, DPO based in India). Monitor for any official designation.

---

## 8. Roles and people

### 8.1 Data Protection Officer
Designate someone as our DPO. Under the DPDP Rules, the DPO must be based in India.

For a firm our size, this can be done by an existing senior team member as an additional responsibility. Document who it is and how to contact them.

### 8.2 Privacy contact email
Set up privacy@valencegrowth.com, legal@valencegrowth.com, security@valencegrowth.com as monitored inboxes.

### 8.3 Training
All Valence team members handling personal data should complete a short annual privacy training. For now, a 30-minute internal session covering the basics is enough.

---

## 9. Pre-launch checklist

Before we publish the privacy policy and Terms of Service live on the website:

1. [ ] Lawyer review (Indian privacy lawyer; ideally EU/US cross-check)
2. [ ] All [BRACKETED] placeholders in the policy filled in
3. [ ] DPO appointed and named
4. [ ] privacy@ / legal@ / security@ inboxes live
5. [ ] DPAs signed with all current vendors
6. [ ] Cookie banner deployed on the public website
7. [ ] Data subject request workflow tested end-to-end
8. [ ] Breach response plan documented
9. [ ] ROPA created
10. [ ] DPIA completed for Orbit

---

## 10. Honest caveats

- I am not a lawyer. This checklist is a strong starting point, but a privacy lawyer should review the final policy and the controls before launch.
- The DPDP Rules were notified on November 13, 2025. Substantive compliance obligations come into force May 13, 2027. We should aim for full compliance by then but the policy can be published now.
- Several US states (Virginia, Colorado, Connecticut, Utah, Texas, Oregon, Montana, Iowa, Indiana, Tennessee, and others) have their own privacy laws. The privacy policy is drafted broadly enough to satisfy them, but specific obligations vary. If our US footprint grows materially, a US privacy lawyer should map our obligations state by state.
- The CCPA's monetary threshold for "business" status is gross revenue over USD 26.625 million (as of 2025) or processing of 100,000+ California residents' personal information per year. If we don't hit these thresholds, the CCPA technically doesn't impose obligations on us. We are committing to the rights anyway because (a) it's the right posture for an international firm, (b) thresholds change, and (c) it's a competitive advantage in client conversations.
