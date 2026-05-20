# Orbit / ValenceOS — first team test

A short note to send to anyone you're inviting to the first internal
test of the platform. Keep this updated as we learn from the test.

---

## What you're testing

**Orbit** (working name: ValenceOS) — the operating platform for
investment-advisory firms. One place for the live pipeline, the firm's
relationships, mandate knowledge, the day planner, and a set of AI
features that draft briefs, emails, target lists, and meeting summaries.

This is the **first real test** with the wider team. Treat it like a
sneak preview: real data, real workflow, but rough edges still being
sanded.

---

## How to get in

1. Open **https://valenceos.vercel.app** in Chrome (or Safari, or
   anything modern).
2. Click **Continue with Google**. Use your **@valencegrowth.com**
   account if you have one.
3. If your email ends in `@valencegrowth.com`, you'll land **straight
   in the workspace** — no setup screen. We auto-add you to the
   Valence team.
4. If you signed in with a different email (e.g. personal gmail),
   you'll see a **Welcome** screen instead. From there you can either:
   - **Join a team** with an 8-character invite code (ask Rishabh for
     yours), or
   - **Start a team** — only if you're actually setting up a different
     firm. Don't pick this if you're a Valence partner.

That's it. You're now inside the workspace with your firm's isolated
data — no other firm can see your deals or contacts.

---

## What to try on the first day

These are the things we most want feedback on. In rough order:

1. **Drop in your data.** Click **Import** in the sidebar.
   - Drag a CSV / Excel of your contacts.
   - Or a PDF teaser of a mandate you're working on.
   - Or paste a chunk of meeting notes / an email thread.
   - AI proposes how each row should land (Person? Deal? Fund?
     Interaction?). You review, edit, click **Create all**.
2. **Add a live mandate** from the Deal Logger. Walk it through the
   stages (Origination → Pitching → Pre-Mandate → Mandate → Closed).
3. **Run an AI feature.** On any deal, click **Generate brief**.
   On any meeting transcript paste, run **Meeting summary**.
4. **Connect Google.** Settings → Integrations → Google Workspace.
   Calendar, Drive, Gmail, Tasks all wire up — your real meetings show
   on the Day Planner, you can draft emails from a deal page.
5. **Invite the rest of your team.** Settings → Team → Generate code
   for each partner / analyst. Send them the link.

---

## What's still rough / known issues

- **No transactional email yet.** When you generate an invite code,
  you have to manually share the link — we haven't wired Resend / SES.
- **Razorpay billing not yet live.** You see your seat count, AI usage,
  and the cycle invoice total in Settings, but no card-on-file or
  invoice email yet.
- **The "Custom" LLM provider option** in Settings → Integrations is a
  power-user escape hatch (Azure OpenAI / Groq / in-house). For the
  test, leave the provider on **Gemini (Managed)** unless you really
  know what you're doing.
- **AI import isn't perfect.** Especially on hand-typed PDFs or
  marketing decks. Review every proposed row before you click Create.
- **No password recovery.** You sign in with Google; if your Google
  account is gone, your seat is gone. (Real auth account recovery is on
  the post-launch list.)

---

## What we want to learn

- Does the **onboarding flow** feel like a real product or does it feel
  like a dev tool? Where do you stumble?
- Is the **AI import** smart enough to be useful? On what file types
  does it fall over?
- Which AI feature do you actually use more than once? Which one's a
  one-time party trick?
- How long does it take from "I sit down to log a deal" to "the deal
  is filed correctly"? In your old workflow vs in Orbit?
- What's missing that would block you using this for real work?

---

## Ping me when

- Anything is broken (screenshot + URL + what you clicked).
- Your data doesn't save (this is the worst one — tell me immediately).
- An AI feature gives you something useful, or something hilariously
  wrong.
- You hit a screen and think "what am I supposed to do here?"

I'm watching the admin dashboard, so I'll usually see errors before you
report them — but flag anyway so I know which user it hit.

— Rishabh
