// Privacy Policy for Orbit (Valence Growth Partners).
//
// Replace before launch:
//   - [DATE] placeholders (effective + last updated)
//   - [VALENCE MUMBAI ADDRESS]
//   - [DPO NAME + EMAIL]
//   - [EU REPRESENTATIVE] line (or remove it)
//   - [DATA ENRICHMENT VENDOR] in subprocessor list (or remove)
// All placeholders are rendered in an amber badge so we can grep for them
// visually before publishing.
//
// Drafted to satisfy India's DPDP Act (primary), GDPR / UK GDPR, CCPA,
// and other US state privacy laws. Tech-stack work needed to make the
// policy honest lives in docs/tech-stack-compliance-checklist.md.

const PLACEHOLDER = 'bg-amber-100 text-amber-900 px-1 rounded font-mono text-[10px]'

function TBD({ children }) {
  return <span className={PLACEHOLDER}>[{children}]</span>
}

export default function Privacy() {
  return (
    <article className="max-w-3xl mx-auto py-10 px-6 prose prose-sm prose-slate dark:prose-invert">
      <p className="vl-eyebrow-ink">Legal</p>
      <h1 className="font-display text-2xl font-bold text-valence-text">Privacy Policy</h1>
      <p className="text-xs text-valence-subtle mt-1">
        Effective: <TBD>DATE TO BE FILLED IN ON LAUNCH</TBD>
        {' · '}Last updated: <TBD>DATE TO BE FILLED IN ON LAUNCH</TBD>
      </p>
      <p className="not-prose mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
        <strong>Draft.</strong> Awaiting lawyer review and the placeholders below.
        Not yet a final legal document.
      </p>

      <h2>1. Who we are</h2>
      <p>
        Valence Growth Partners is a capital advisory and M&amp;A advisory firm with
        offices in Mumbai, India and London, United Kingdom. We provide investment
        advisory services to companies, investors, and other counterparties.
      </p>
      <p>In this policy:</p>
      <ul>
        <li>&quot;Valence&quot;, &quot;we&quot;, &quot;us&quot;, and &quot;our&quot; mean Valence Growth Partners and its affiliates.</li>
        <li>&quot;You&quot; means the person whose personal data we hold, whether you are a client, a counterparty contact, a visitor to our website, an applicant for a role at Valence, or anyone else whose data reaches us.</li>
        <li>&quot;Orbit&quot; means our internal platform that helps us manage relationships, deals, and knowledge across the firm.</li>
      </ul>
      <p>Our contact details for privacy matters:</p>
      <ul>
        <li>Email: <a href="mailto:privacy@valencegrowth.com">privacy@valencegrowth.com</a></li>
        <li>Postal address: <TBD>VALENCE MUMBAI ADDRESS</TBD></li>
        <li>Data Protection Officer: <TBD>NAME AND EMAIL</TBD></li>
      </ul>
      <p>
        For users in the European Union or United Kingdom, our representative for
        GDPR / UK GDPR purposes is: <TBD>EU REPRESENTATIVE OR REMOVE LINE</TBD>
      </p>

      <h2>2. Our role under different laws</h2>
      <p>
        We are an Indian company, so India&apos;s Digital Personal Data Protection Act,
        2023 (&quot;DPDP Act&quot;) and the DPDP Rules, 2025 are our primary legal framework.
        Under the DPDP Act, we are a &quot;Data Fiduciary&quot; for the personal data we control.
      </p>
      <p>
        We also serve clients and counterparties internationally. Where the law of
        another jurisdiction applies to you, we comply with that law as well. Specifically:
      </p>
      <ul>
        <li><strong>European Economic Area and United Kingdom:</strong> Under the EU General Data Protection Regulation and the UK GDPR, we act as a &quot;data controller&quot; for personal data we determine the purposes and means of processing.</li>
        <li><strong>California, USA:</strong> Under the California Consumer Privacy Act, as amended by the California Privacy Rights Act (together, &quot;CCPA&quot;), we act as a &quot;business&quot; when we meet the statutory thresholds.</li>
        <li><strong>Other US states:</strong> Where state-level privacy laws apply (such as those in Virginia, Colorado, Connecticut, Utah, Texas, and others), we comply with the rights and obligations they create.</li>
      </ul>
      <p>If any provision of this policy conflicts with a mandatory legal requirement that applies to you, the legal requirement applies.</p>

      <h2>3. What we mean by personal data</h2>
      <p>
        Personal data means any information that relates to an identified or
        identifiable individual. Examples include your name, business email, phone
        number, job title, employer, communications you exchange with us, and
        information about your role in a transaction.
      </p>
      <p>
        Some categories of personal data are treated as more sensitive under different
        laws (for example, &quot;sensitive personal information&quot; under the CCPA, &quot;special
        categories&quot; under the GDPR). We generally do not collect such categories in our
        ordinary course of business. Where we do, we apply additional safeguards and
        disclose this in Section 4.
      </p>

      <h2>4. What personal data we collect and why</h2>
      <p>
        We collect personal data in the following categories. For each, we describe
        the data, the purpose, and our lawful basis under the GDPR (the GDPR has the
        most prescriptive lawful-basis framework, so listing it covers our DPDP and
        CCPA disclosures as well).
      </p>

      <h3>4.1 Professional contact information</h3>
      <p>
        <strong>What we collect:</strong> name, business email, phone number, employer,
        job title, work location, professional background, and information you share in
        business communications with us.
      </p>
      <p>
        <strong>How we collect it:</strong> directly from you, from your employer, from
        public sources (such as LinkedIn, company websites, regulatory filings), from
        introductions made by mutual contacts, and from data enrichment providers we engage.
      </p>
      <p>
        <strong>Why we use it:</strong> to conduct our advisory business, to identify and
        develop deal opportunities, to make introductions, to maintain our professional
        network, and to communicate with you about transactions and market developments.
      </p>
      <p>
        <strong>Lawful basis (GDPR):</strong> legitimate interests (the legitimate
        interest of operating a capital advisory and M&amp;A advisory practice and
        maintaining a professional network), and where applicable, the performance
        of a contract with you or your employer.
      </p>
      <p>
        <strong>Under the DPDP Act:</strong> this processing falls under the consent
        ground when you give us your information voluntarily for a specified purpose,
        and under &quot;certain legitimate uses&quot; where you have voluntarily provided your
        data and not objected.
      </p>

      <h3>4.2 Transaction and deal information</h3>
      <p>
        <strong>What we collect:</strong> information about transactions you or your
        organisation are involved in, including roles, mandates, deal stages,
        counterparties, financial terms (where shared with us by you or your
        organisation), and related correspondence.
      </p>
      <p>
        <strong>How we collect it:</strong> directly from you, from your representatives,
        from data rooms you grant us access to, and from other parties involved in the
        transaction.
      </p>
      <p>
        <strong>Why we use it:</strong> to provide our advisory services, to maintain a
        record of the transaction, to coordinate across the deal team, to meet our
        regulatory and professional obligations, and to support post-closing matters.
      </p>
      <p>
        <strong>Lawful basis (GDPR):</strong> performance of a contract, and legal
        obligation where applicable.
      </p>

      <h3>4.3 Interaction and meeting data</h3>
      <p>
        <strong>What we collect:</strong> metadata of business emails and calendar
        events between Valence personnel and external contacts (sender, recipient,
        timestamp, subject line, and meeting title and duration). We also generate
        written summaries of meetings and calls.
      </p>
      <p>
        <strong>Why we use it:</strong> to maintain an accurate institutional record of
        our relationships, to help our team find the warmest introduction path to a
        target, to support hand-offs when team members change, and to surface stale or
        at-risk relationships before they go cold.
      </p>
      <p>
        <strong>What we do not collect:</strong> we do not store the body content of
        emails. We do not record phone calls or video meetings unless we obtain your
        prior consent on the call.
      </p>
      <p>
        <strong>Lawful basis (GDPR):</strong> legitimate interests (institutional
        knowledge management, relationship continuity, and team coordination).
      </p>

      <h3>4.4 Website and platform usage data</h3>
      <p>
        <strong>What we collect:</strong> IP address, browser type, device identifiers,
        pages visited, referring URLs, and cookies and similar technologies (see Section 11).
      </p>
      <p>
        <strong>Why we use it:</strong> to operate and secure our website and our
        internal platform Orbit, to detect and prevent fraud and abuse, and to improve
        performance.
      </p>
      <p><strong>Lawful basis (GDPR):</strong> legitimate interests and, where required, consent.</p>

      <h3>4.5 Recruitment data</h3>
      <p>
        <strong>What we collect:</strong> information you provide if you apply for a
        role with us, including your CV, work history, education, and references.
      </p>
      <p>
        <strong>Why we use it:</strong> to evaluate your application, to communicate
        with you about the role, and to maintain records of the recruitment process.
      </p>
      <p>
        <strong>Lawful basis (GDPR):</strong> steps prior to entering into a contract,
        and legitimate interests.
      </p>

      <h3>4.6 What we do NOT collect</h3>
      <p>We do not collect or process:</p>
      <ul>
        <li>Special categories of personal data under the GDPR (such as racial or ethnic origin, religious beliefs, health data, biometric data, sexual orientation), except where you voluntarily share such information in the course of a business communication, in which case we do not act on it.</li>
        <li>Information about children. Our services are not directed at children, and we do not knowingly collect data about anyone under the age of 18.</li>
        <li>Neural data, precise geolocation data, government identification numbers, or financial account numbers, except where strictly necessary for a specific transaction and with appropriate safeguards.</li>
      </ul>

      <h2>5. We do not sell your personal data. Ever.</h2>
      <p><strong>This is the most important sentence in this document.</strong></p>
      <p>
        We do not sell, rent, or trade your personal data. We do not share your
        personal data with third parties for those third parties&apos; own marketing
        purposes. We do not participate in cross-context behavioural advertising. We
        are an advisory firm, not a data business.
      </p>
      <p>
        This applies to all individuals, in all jurisdictions, regardless of whether
        you are protected by the CCPA, the GDPR, the DPDP Act, or any other law.
      </p>
      <p>
        For California residents specifically: we have not sold or shared personal
        information in the 12 months preceding the effective date of this policy, and
        we do not plan to do so.
      </p>

      <h2>6. Who we share your personal data with</h2>
      <p>We share personal data only in the following limited circumstances:</p>
      <p>
        <strong>Within Valence.</strong> Personal data is accessible to Valence
        personnel who need it to do their job, including team members in our Mumbai
        and London offices.
      </p>
      <p>
        <strong>With your counterparties in a transaction.</strong> If you are
        involved in a deal we are advising on, we share relevant information with the
        other parties to the transaction. We share only what is necessary and what
        you would reasonably expect us to share to do our job.
      </p>
      <p>
        <strong>With service providers we engage.</strong> We use a small set of
        trusted vendors to operate our business, listed in Section 7. These vendors
        process personal data on our behalf under written contracts that require them
        to protect it and use it only for the purposes we instruct.
      </p>
      <p>
        <strong>When required by law.</strong> We disclose personal data when we are
        legally required to (for example, to comply with a court order, a regulatory
        investigation, or a tax authority demand).
      </p>
      <p>
        <strong>To protect rights and safety.</strong> We may disclose personal data
        to investigate or prevent fraud, security incidents, or threats to the safety
        of any person.
      </p>
      <p>
        <strong>In connection with a corporate transaction.</strong> If Valence is
        involved in a merger, acquisition, restructuring, or sale of assets, personal
        data may be transferred as part of that transaction. We will give you notice
        if this materially changes how your data is handled.
      </p>

      <h2>7. Our service providers</h2>
      <p>
        We rely on the following categories of service providers. Each is bound by a
        data processing agreement and is permitted to use personal data only on our
        instructions.
      </p>
      <ul>
        <li><strong>Cloud infrastructure and database:</strong> Supabase (hosted on AWS) for our Orbit platform.</li>
        <li><strong>Hosting and deployment:</strong> Vercel for our web platform.</li>
        <li><strong>Email and productivity:</strong> Google Workspace.</li>
        <li><strong>AI processing:</strong> Google Gemini for natural-language features inside Orbit.</li>
        <li><strong>Communications:</strong> Slack for internal team communications.</li>
        <li><strong>Data enrichment:</strong> <TBD>FILL IN IF / WHEN WE INTEGRATE TRACXN, APOLLO, OR SIMILAR</TBD></li>
      </ul>
      <p>
        A current and complete list of subprocessors is available on request from{' '}
        <a href="mailto:privacy@valencegrowth.com">privacy@valencegrowth.com</a>. We
        update the list when we add or change a subprocessor.
      </p>

      <h2>8. International data transfers</h2>
      <p>
        Because we operate from India and the United Kingdom and serve clients
        globally, your personal data may be transferred across borders. Specifically:
      </p>
      <ul>
        <li>Data may be stored or processed in India, the European Union (where our cloud providers operate data centres), the United States (where some of our service providers are headquartered), or other jurisdictions where our service providers operate.</li>
        <li>When we transfer personal data out of the EEA or UK, we rely on the European Commission&apos;s Standard Contractual Clauses or the UK International Data Transfer Agreement, together with any supplementary measures required by the transfer impact assessment.</li>
        <li>When we transfer personal data out of India, we comply with the DPDP Act&apos;s cross-border transfer rules. As of the date of this policy, the Central Government of India has not restricted transfers to specific countries; we will update our practices if this changes.</li>
      </ul>

      <h2>9. How long we keep your personal data</h2>
      <p>
        We keep personal data only as long as necessary for the purposes set out in
        this policy. In practice:
      </p>
      <ul>
        <li><strong>Active relationships:</strong> we keep your data for as long as we are doing business with you or your organisation, plus a reasonable period after.</li>
        <li><strong>Closed transactions:</strong> we keep transaction records for at least 7 years after closing, to comply with legal, tax, and regulatory obligations and to address post-closing matters.</li>
        <li><strong>Recruitment data:</strong> if you are not hired, we keep your application for up to 12 months unless you ask us to delete it sooner.</li>
        <li><strong>Website and platform logs:</strong> we keep these for up to 24 months.</li>
      </ul>
      <p>
        When we no longer need your data, we either delete it or anonymise it so it
        can no longer be linked to you.
      </p>

      <h2>10. Your rights</h2>
      <p>
        You have rights over your personal data. The exact rights you have depend on
        where you are.
      </p>

      <h3>10.1 Rights everyone has when dealing with us</h3>
      <ul>
        <li><strong>Access:</strong> you can ask us what personal data we hold about you.</li>
        <li><strong>Correction:</strong> you can ask us to correct inaccurate or incomplete data.</li>
        <li><strong>Erasure:</strong> you can ask us to delete your data, subject to our right to retain it where law requires or our legitimate interests permit.</li>
        <li><strong>Withdraw consent:</strong> where we rely on your consent, you can withdraw it at any time, without affecting processing we did before you withdrew.</li>
        <li><strong>Complaint:</strong> you can complain to us, and you can complain to your data protection regulator.</li>
      </ul>

      <h3>10.2 Additional rights under the GDPR / UK GDPR</h3>
      <p>If you are in the EEA or the UK:</p>
      <ul>
        <li><strong>Restriction:</strong> you can ask us to limit how we use your data while we resolve a dispute about it.</li>
        <li><strong>Portability:</strong> you can ask for a copy of the data you gave us in a structured, machine-readable format.</li>
        <li><strong>Objection:</strong> you can object to processing we do under our legitimate interests, including direct marketing (we do not do behavioural advertising, but if you receive any business communication from us you don&apos;t want, tell us and we&apos;ll stop).</li>
        <li><strong>No automated decision-making with legal effects:</strong> we do not make decisions about you using only automated processing that produce legal effects or similarly significant effects on you.</li>
        <li><strong>Complain to your supervisory authority:</strong> in the UK, the Information Commissioner&apos;s Office. In other EEA countries, your national data protection authority.</li>
      </ul>

      <h3>10.3 Additional rights under the DPDP Act</h3>
      <p>If you are a Data Principal in India:</p>
      <ul>
        <li><strong>Right to information about processing:</strong> you can ask us a summary of the personal data we process about you and the activities we have undertaken with it.</li>
        <li><strong>Right to grievance redressal:</strong> you can raise a grievance with our DPO. If we don&apos;t resolve it to your satisfaction, you can escalate to the Data Protection Board of India.</li>
        <li><strong>Right to nominate:</strong> you can nominate another individual to exercise your rights in the event of your death or incapacity.</li>
      </ul>

      <h3>10.4 Additional rights under the CCPA (California residents)</h3>
      <p>If you are a California resident:</p>
      <ul>
        <li><strong>Right to know:</strong> you can ask for the specific pieces of personal information we have about you, the categories of personal information we collect, the sources, the purposes, and the categories of third parties we share with.</li>
        <li><strong>Right to delete:</strong> you can ask us to delete personal information we collected from you, subject to exceptions in the law.</li>
        <li><strong>Right to correct:</strong> you can ask us to correct inaccurate personal information.</li>
        <li><strong>Right to opt out of sale or sharing:</strong> we do not sell or share your personal information, so there is nothing to opt out of. We confirm this in writing on request.</li>
        <li><strong>Right to limit use of sensitive personal information:</strong> we do not use sensitive personal information beyond what is necessary to provide our services, so there is no additional use to limit.</li>
        <li><strong>Right to non-discrimination:</strong> we will not deny you services, charge you a different price, or provide a different level of quality because you exercised your privacy rights.</li>
      </ul>
      <p>
        We do not use &quot;automated decision-making technology&quot; to make significant
        decisions about California residents within the meaning of the California
        Privacy Protection Agency&apos;s 2026 regulations.
      </p>

      <h3>10.5 How to exercise your rights</h3>
      <p>
        Email <a href="mailto:privacy@valencegrowth.com">privacy@valencegrowth.com</a>{' '}
        with a description of the right you want to exercise. We will respond within
        the timeframes required by the law that applies to you (generally one month
        under the GDPR, 45 days under the CCPA, and reasonable time under the DPDP Act).
      </p>
      <p>
        We may need to verify your identity before we act. We will not charge you
        for exercising your rights unless your request is manifestly unfounded or
        excessive, in which case we may charge a reasonable fee or refuse to act,
        and we will explain why.
      </p>

      <h2>11. Cookies and similar technologies</h2>
      <p>Our website uses a small number of cookies and similar technologies. We use:</p>
      <ul>
        <li><strong>Strictly necessary cookies</strong> to make the site work. These cannot be disabled.</li>
        <li><strong>Performance and analytics cookies</strong> to understand how the site is used. We do not use these for cross-site behavioural advertising.</li>
        <li><strong>Preference cookies</strong> to remember your choices (such as your cookie preferences).</li>
      </ul>
      <p>
        You can control non-essential cookies through the cookie banner on our website
        and through your browser settings. Where required by law (such as in the EEA,
        the UK, and California), we ask for your consent before setting non-essential
        cookies, and we honour Global Privacy Control and similar opt-out signals.
      </p>

      <h2>12. How we keep your personal data secure</h2>
      <p>
        We protect personal data using a combination of administrative, technical, and
        physical safeguards. These include:
      </p>
      <ul>
        <li>Encryption of data in transit (TLS) and at rest where supported by our infrastructure.</li>
        <li>Access controls based on role and need-to-know, including multi-factor authentication for systems holding personal data.</li>
        <li>Logging and monitoring of access to personal data.</li>
        <li>Vendor due diligence and written data processing agreements with all service providers.</li>
        <li>Regular review and update of our security practices.</li>
      </ul>
      <p>
        No system is perfectly secure. If a personal data breach occurs that is
        likely to affect you, we will notify you and the relevant regulators within
        the timeframes the law requires (72 hours to the Data Protection Board of
        India and to EU / UK supervisory authorities where the threshold is met, and
        without unreasonable delay to affected individuals).
      </p>

      <h2>13. Children</h2>
      <p>
        Our services are not directed at children. We do not knowingly collect
        personal data from anyone under the age of 18. If you believe we have
        inadvertently collected data about a child, contact us at{' '}
        <a href="mailto:privacy@valencegrowth.com">privacy@valencegrowth.com</a> and
        we will delete it.
      </p>

      <h2>14. Changes to this policy</h2>
      <p>
        We may update this policy from time to time. When we make material changes,
        we will update the &quot;Last updated&quot; date and, where appropriate, notify you
        directly (for example, by email to active client contacts).
      </p>

      <h2>15. Contact us</h2>
      <p>For any questions or to exercise your rights:</p>
      <ul>
        <li>Email: <a href="mailto:privacy@valencegrowth.com">privacy@valencegrowth.com</a></li>
        <li>Data Protection Officer: <TBD>NAME</TBD>, <TBD>EMAIL</TBD></li>
        <li>Postal: <TBD>VALENCE MUMBAI ADDRESS</TBD></li>
      </ul>
    </article>
  )
}
