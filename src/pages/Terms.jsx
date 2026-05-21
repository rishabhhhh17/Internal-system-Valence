// Terms of Service for Orbit (Valence Growth Partners).
//
// Replace before launch: [DATE] placeholders, [VALENCE MUMBAI ADDRESS].
// All placeholders are rendered in an amber badge so we can grep for them
// visually before publishing.

const PLACEHOLDER = 'bg-amber-100 text-amber-900 px-1 rounded font-mono text-[10px]'

function TBD({ children }) {
  return <span className={PLACEHOLDER}>[{children}]</span>
}

export default function Terms() {
  return (
    <article className="max-w-3xl mx-auto py-10 px-6 prose prose-sm prose-slate dark:prose-invert">
      <p className="vl-eyebrow-ink">Legal</p>
      <h1 className="font-display text-2xl font-bold text-valence-text">Terms of Service</h1>
      <p className="text-xs text-valence-subtle mt-1">
        Effective: <TBD>DATE TO BE FILLED IN ON LAUNCH</TBD>
        {' · '}Last updated: <TBD>DATE TO BE FILLED IN ON LAUNCH</TBD>
      </p>
      <p className="not-prose mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
        <strong>Draft.</strong> Awaiting lawyer review and the placeholders below.
        Not yet a final legal document.
      </p>

      <h2>1. About these terms</h2>
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your use of the websites,
        communications, and services provided by Valence Growth Partners
        (&quot;Valence&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;). By accessing our website or engaging with
        our services, you agree to these Terms.
      </p>
      <p>
        If you are entering into these Terms on behalf of an organisation, you
        confirm that you have authority to bind that organisation, and &quot;you&quot; means
        both you personally and the organisation.
      </p>
      <p>
        These Terms work alongside our <a href="/privacy">Privacy Policy</a>, which
        is incorporated here by reference. The Privacy Policy describes how we handle
        personal data, and these Terms reinforce that commitment.
      </p>

      <h2>2. Who we are and what we do</h2>
      <p>
        Valence Growth Partners is a capital advisory and M&amp;A advisory firm. We
        help our clients with mergers, acquisitions, capital raises, and related
        transactions.
      </p>
      <p>
        We are an Indian company with offices in Mumbai and London, and we work with
        clients and counterparties across multiple jurisdictions.
      </p>
      <p>
        Nothing on our website or in our general communications is a solicitation to
        buy or sell any security, an investment recommendation, or legal, tax, or
        accounting advice. Any advisory relationship with us is established only
        through a written engagement agreement.
      </p>

      <h2>3. Our promise on data</h2>
      <p>
        We want to be clear up front about a few things that go beyond ordinary
        terms-of-service language, because they matter.
      </p>
      <p>
        <strong>We do not sell your data.</strong> Not to advertisers, not to data
        brokers, not to anyone. This applies regardless of where you live.
      </p>
      <p>
        <strong>We do not use your data for advertising.</strong> We do not engage
        in behavioural advertising, we do not share data with third parties for their
        marketing, and we do not build advertising profiles.
      </p>
      <p>
        <strong>We do not use your business communications to train public AI
        models.</strong> Communications you exchange with us are not used to train any
        third party&apos;s general-purpose AI model. Internal AI features we use (such as
        the Gemini-powered summarisation inside our internal platform Orbit) are
        governed by data processing agreements that restrict the AI vendor from using
        your data to train their models.
      </p>
      <p>
        <strong>California residents have specific rights and we follow them.</strong>{' '}
        The California Privacy Rights Act gives California residents specific rights,
        including the right to know, delete, correct, and opt out of sale and sharing.
        Because we do not sell or share data in the first place, there is nothing to
        opt out of, but we honour all other rights as described in our Privacy Policy.
      </p>
      <p>
        <strong>We comply with the laws that apply to you.</strong> India&apos;s DPDP Act
        applies because we are Indian. The GDPR applies if you are in the EEA or UK.
        State laws like the CCPA apply if you are a covered California resident. We
        follow all of them.
      </p>

      <h2>4. Acceptable use</h2>
      <p>When you use our website or our services, you agree not to:</p>
      <ul>
        <li>Use them for any unlawful purpose or in violation of any applicable law.</li>
        <li>Attempt to gain unauthorised access to any part of our systems, accounts, or data.</li>
        <li>Interfere with the security, integrity, or availability of our services (including by introducing malware, attempting denial-of-service attacks, or probing for vulnerabilities without authorisation).</li>
        <li>Scrape, harvest, or systematically extract data from our website except as expressly permitted.</li>
        <li>Reverse-engineer or attempt to derive the source code of any software we provide, except to the extent law permits.</li>
        <li>Impersonate any person or misrepresent your affiliation with any person or organisation.</li>
        <li>Use our services to harass, defame, or harm any other person.</li>
      </ul>
      <p>
        If you are a security researcher and you discover a vulnerability, please
        email <a href="mailto:security@valencegrowth.com">security@valencegrowth.com</a>{' '}
        rather than exploiting it. We will work with you in good faith.
      </p>

      <h2>5. Confidentiality</h2>
      <p>
        In the course of our work, we exchange confidential information with clients,
        counterparties, and other parties. We take confidentiality seriously.
      </p>
      <p>
        If you share confidential information with us in connection with a potential
        or actual engagement, we treat it as confidential and use it only for the
        purpose for which it was shared, subject to:
      </p>
      <ul>
        <li>our legal and regulatory obligations,</li>
        <li>any specific confidentiality terms in a separate written agreement (such as an NDA or engagement letter), which take precedence over these Terms if they conflict, and</li>
        <li>the disclosures we permit to ourselves in our Privacy Policy (such as to our service providers under appropriate contractual restrictions).</li>
      </ul>
      <p>
        If you receive confidential information from us, you agree to treat it with
        the same level of care.
      </p>

      <h2>6. Intellectual property</h2>
      <p>
        The content on our website, including our research, reports, branding, and
        platform, belongs to Valence or our licensors. We grant you a limited,
        non-exclusive, non-transferable licence to access and use our website for
        lawful informational purposes only.
      </p>
      <p>
        You may not reproduce, redistribute, or publish our content without our
        written permission, except as permitted by applicable law (such as quoting
        brief excerpts with attribution).
      </p>
      <p>
        Any feedback or suggestions you give us about our services is welcomed and
        may be used by us without obligation to you.
      </p>

      <h2>7. Disclaimers</h2>
      <p>
        We provide our website and our general communications &quot;as is&quot; and &quot;as
        available&quot;. To the maximum extent permitted by law:
      </p>
      <ul>
        <li>We do not warrant that the website will be uninterrupted, error-free, or secure.</li>
        <li>We do not warrant the accuracy, completeness, or timeliness of any information on the website or in general communications.</li>
        <li>Any market commentary, analysis, or general information we publish is for informational purposes only and is not investment, legal, tax, or accounting advice.</li>
        <li>We are not your advisor unless we have signed an engagement letter with you that says so.</li>
      </ul>
      <p>
        Nothing in this section limits any warranty or liability that cannot be
        limited under applicable law (including under Indian, EU, or UK consumer
        protection law where relevant).
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Valence and its affiliates, officers,
        employees, and agents are not liable for any indirect, incidental, special,
        consequential, or punitive damages arising out of or in connection with your
        use of our website or general communications, even if we have been advised of
        the possibility of such damages.
      </p>
      <p>
        Our total liability to you for any claim arising out of or in connection
        with these Terms is limited to one hundred US dollars (USD 100) or the
        equivalent in your local currency.
      </p>
      <p>
        This limitation does not apply to liability that cannot be excluded by law,
        such as liability for fraud, gross negligence, willful misconduct, or death
        or personal injury caused by our negligence.
      </p>
      <p>
        For paid advisory engagements, liability is governed by the separate
        engagement letter, which controls over this section to the extent it differs.
      </p>

      <h2>9. Third-party services and links</h2>
      <p>
        Our website may link to third-party websites or services. We do not control
        those, and we are not responsible for their content, practices, or privacy
        policies. Following a link is at your own risk.
      </p>

      <h2>10. Termination</h2>
      <p>
        We may suspend or terminate your access to our website or services at any
        time if you breach these Terms or if we reasonably believe doing so is
        necessary to protect Valence, our clients, or other users.
      </p>
      <p>
        You can stop using our services at any time. Sections that by their nature
        should survive termination (including confidentiality, intellectual property,
        disclaimers, limitation of liability, and dispute resolution) will continue
        to apply.
      </p>

      <h2>11. Governing law and dispute resolution</h2>
      <p>
        These Terms are governed by the laws of India, without regard to its conflict
        of laws principles. The courts of Mumbai, India have exclusive jurisdiction
        over any dispute arising out of or in connection with these Terms.
      </p>
      <p>
        This clause does not deprive you of the protection of mandatory consumer laws
        in your country of residence. If you are a consumer in the EEA or UK, you may
        also bring proceedings in the courts of your country of residence, and EU and
        UK consumer laws may give you additional rights.
      </p>
      <p>
        Nothing in this section prevents either party from seeking urgent injunctive
        relief in any competent court.
      </p>

      <h2>12. Changes to these terms</h2>
      <p>
        We may update these Terms from time to time. When we make material changes,
        we will update the &quot;Last updated&quot; date and, where appropriate, notify you
        directly. Your continued use of our services after we publish the updated
        Terms means you accept the changes.
      </p>

      <h2>13. Miscellaneous</h2>
      <p>
        <strong>Entire agreement.</strong> These Terms, together with our Privacy
        Policy and any written agreement we have with you (such as an engagement
        letter or NDA), are the entire agreement between you and us regarding the
        subject matter. If they conflict, the written agreement controls.
      </p>
      <p>
        <strong>Severability.</strong> If any provision of these Terms is held to be
        unenforceable, the rest remain in force.
      </p>
      <p>
        <strong>No waiver.</strong> If we don&apos;t enforce a right under these Terms
        immediately, that is not a waiver of the right.
      </p>
      <p>
        <strong>Assignment.</strong> You may not assign these Terms without our
        written consent. We may assign these Terms in connection with a corporate
        transaction.
      </p>
      <p>
        <strong>Notices.</strong> Notices to us should be sent to{' '}
        <a href="mailto:legal@valencegrowth.com">legal@valencegrowth.com</a> or to
        our Mumbai office.
      </p>

      <h2>14. Contact us</h2>
      <ul>
        <li>Email: <a href="mailto:legal@valencegrowth.com">legal@valencegrowth.com</a></li>
        <li>Privacy questions: <a href="mailto:privacy@valencegrowth.com">privacy@valencegrowth.com</a></li>
        <li>Security reports: <a href="mailto:security@valencegrowth.com">security@valencegrowth.com</a></li>
        <li>Postal: <TBD>VALENCE MUMBAI ADDRESS</TBD></li>
      </ul>
    </article>
  )
}
