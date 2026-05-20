// Starter Terms of Service. Replace before launch with a lawyer-reviewed
// version. The structure mirrors what a typical B2B SaaS ToS covers; the
// firm-name + domain placeholders should be swapped for the production
// brand before any customer signs the agreement.

export default function Terms() {
  return (
    <article className="max-w-3xl mx-auto py-10 px-6 prose prose-sm prose-slate dark:prose-invert">
      <p className="vl-eyebrow-ink">Legal</p>
      <h1 className="font-display text-2xl font-bold text-valence-text">Terms of Service</h1>
      <p className="text-xs text-valence-subtle mt-1">Last updated: <em>placeholder — set on launch</em></p>

      <h2>1. The service</h2>
      <p>
        Orbit (the "Service"), operated by Valence Growth Partners ("we", "us"),
        is an internal operating platform for investment-advisory firms. By
        creating an account or using the Service, you agree to these terms.
      </p>

      <h2>2. Accounts &amp; seats</h2>
      <p>
        An "Org" is a single customer firm. Each member of the firm uses
        a "Seat." You're responsible for keeping account credentials secure
        and for the actions taken under any seat you control.
      </p>

      <h2>3. Plans &amp; billing</h2>
      <p>
        Three plans: <strong>BYO Key</strong> (you bring your own AI API
        key — we never bill you for AI), <strong>Own Key</strong> (same as
        BYO Key for billing purposes), and <strong>We Run AI</strong> (we
        supply AI; you're billed per included allowance plus any overage
        you explicitly opt into).
      </p>
      <p>
        Seats are billed upfront at the start of each monthly cycle. Seats
        added mid-cycle bill from the next cycle (no proration). A monthly
        floor applies when (seats × seat price) is below the floor amount.
      </p>
      <h3>3.1 AI overage</h3>
      <p>
        On the <em>We Run AI</em> plan, each seat receives a monthly
        included allowance of AI actions. When a seat reaches its
        allowance, AI features for that seat are paused until the seat
        either (a) opts in to the metered overage rate or (b) waits for
        the next monthly reset. Overage is itemised on the invoice.
      </p>

      <h2>4. Data</h2>
      <p>
        You own the data you upload. We process it solely to provide the
        Service. We don't sell, lease, or share your data with third
        parties except where strictly necessary to run the Service (e.g.
        AI provider for queries you initiate).
      </p>

      <h2>5. Storage</h2>
      <p>
        Each seat includes a storage allowance. We do not auto-bill for
        storage overage. If usage materially exceeds the allowance, we'll
        review with you before taking any action.
      </p>

      <h2>6. Acceptable use</h2>
      <p>
        Don't use the Service for anything illegal, abusive, or to
        reverse-engineer the platform. Don't upload data you don't have
        rights to.
      </p>

      <h2>7. Termination</h2>
      <p>
        You may cancel any time; access continues through the end of the
        paid cycle. We may suspend an account for non-payment after notice,
        or terminate immediately for material breach.
      </p>

      <h2>8. Liability</h2>
      <p>
        The Service is provided "as is." Our aggregate liability is limited
        to the fees paid in the 12 months preceding the claim. Nothing in
        these terms limits liability that cannot be limited at law.
      </p>

      <h2>9. Contact</h2>
      <p>Questions: <a href="mailto:hello@valencegrowth.com">hello@valencegrowth.com</a></p>
    </article>
  )
}
