// Starter Privacy Policy. Replace before launch with a lawyer-reviewed
// version. Firms — especially IB / advisory — will ask for this plus a
// DPA before signing. Keep this honest about what we collect and why;
// over-promising in a Privacy Policy is the easy way to get sued.

export default function Privacy() {
  return (
    <article className="max-w-3xl mx-auto py-10 px-6 prose prose-sm prose-slate dark:prose-invert">
      <p className="vl-eyebrow-ink">Legal</p>
      <h1 className="font-display text-2xl font-bold text-valence-text">Privacy Policy</h1>
      <p className="text-xs text-valence-subtle mt-1">Last updated: <em>placeholder — set on launch</em></p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account data:</strong> name, email, role.</li>
        <li><strong>Firm data you upload:</strong> deal records, contacts,
            meeting notes, files. Treated as your confidential data.</li>
        <li><strong>Usage telemetry:</strong> which features are used and
            how often, to improve the product. Aggregated; never sold.</li>
        <li><strong>Billing data:</strong> seat count, AI actions consumed,
            storage usage. Used only to compute invoices.</li>
      </ul>

      <h2>What we DON'T do</h2>
      <ul>
        <li>We don't sell your data.</li>
        <li>We don't use your deal data to train models.</li>
        <li>We don't share with third parties except sub-processors
            required to run the Service.</li>
      </ul>

      <h2>Sub-processors</h2>
      <ul>
        <li><strong>Supabase</strong> — database + auth + file storage.</li>
        <li><strong>Google (Gemini)</strong> — AI queries you initiate
            (Ask, Deal Brief, etc.). Only the prompt + relevant context is
            sent. We do not enable Google's training on our content.</li>
        <li><strong>Vercel</strong> — application hosting.</li>
        <li><strong>Razorpay</strong> — payment processing (when on a paid
            plan).</li>
      </ul>

      <h2>Where data lives</h2>
      <p>
        Primary database in <em>ap-northeast-1</em> (Supabase). If you
        require a different region for compliance, contact us.
      </p>

      <h2>Retention</h2>
      <p>
        We keep your firm data until you delete it or close the account.
        Backups roll off automatically within 30 days of deletion.
      </p>

      <h2>Your rights</h2>
      <p>
        You can export everything via the in-app CSV exports, and request
        full deletion by emailing the address below. We respond within
        30 days.
      </p>

      <h2>Security</h2>
      <p>
        TLS in transit. Row-level security on every table so customer data
        is isolated by org. Access to production is restricted to engineers
        with a documented need.
      </p>

      <h2>Contact</h2>
      <p>Questions or DPA requests: <a href="mailto:privacy@valencegrowth.com">privacy@valencegrowth.com</a></p>
    </article>
  )
}
