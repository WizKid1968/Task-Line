# Brief: OPUS landing page with email sign-up

You are building a landing page for **OPUS**, a product owned by **Rudy** (the person giving you
this brief). Read all of it before you start, then ask Rudy the questions in section 9.

---

## 1. Who you're working with (read first)

Rudy's rules for working with him. They're firm:

- **Plain English, no jargon.** Explain what you're doing in everyday words.
- **Ask clarifying questions when something is unclear.** Don't guess.
- **Never assume, always verify.** Check that things work, and say what you checked.
- **No shortcuts that lower quality.**
- **Be explicit with instructions.** When Rudy has to click something, say exactly where it is,
  what to click, what to type, and what he should see.
- **Show before going live.** Send screenshots or a preview link and get his OK before
  publishing anything, connecting a domain, or spending money.
- **Never ask him to paste passwords, API keys or tokens into the chat.** They go straight into
  the hosting settings (for example Vercel environment variables).

## 2. What OPUS is (the product)

**OPUS = OmniPotent Personal Utility System.** The "O" stands for "it can do anything you can
imagine". The O is the visual symbol of the brand.

In one sentence: **OPUS is a personal AI assistant that lives in a phone number. No app to
download. You call it or text it, say what you need in plain words, and it gets it done.**

How it works (this is the core message, show it clearly):

1. **Call or text OPUS** and just say what you need. Example: "Order lunch for the team. 12
   people, Thai, by 12:30."
2. **OPUS checks with you.** It reads the request back and asks for your okay: "Got it. Thai
   Garden, 12 lunches, arriving at 12:30. Should I order?"
3. **Say yes, and it's done.** OPUS does it and texts you when it's finished.

When you call, OPUS answers like a receptionist ("Hi, this is Opus! What can I do for you?") and
you talk to it like a person. When you text, it texts back.

What people use it for (examples used in the ad; use them on the page):

- **Busy parent:** "Plan my daughter's party." OPUS finds the venue, writes the invites and
  sends you the plan.
- **Small business:** "Build me a booking website." OPUS builds it and sends you the link.
- **Office:** "Order lunch for the team." OPUS places the order and texts you when it's on the way.
- **Student:** "Make me a study guide from my notes." It's back in minutes.
- **Every day:** reads and answers your email, runs your calendar, researches anything, and
  texts people for you.

Why it's safe (real features, mention them):

- **Nothing happens without your okay.** Anything permanent is read back first and needs a yes.
- **A private code word.** Over text, it also asks for your personal code word before acting.
- **Only your number can use it.** Strangers who call or text get nothing.
- **Scam emails get screened** before OPUS opens them.

How it's sold: **"Book your setup."** OPUS is set up for each customer and customized to what
they want (for example, some customers will want it to make purchases for them, others won't).
There is no app and nothing to install for the customer. **Don't show prices**; pricing isn't
decided yet. Don't promise a launch date.

## 3. The goal of the page

**Capture emails of people interested in OPUS** so Rudy can see who wants it and follow up.

- Main call to action: an email sign-up ("Get early access" or "Book your setup"; ask Rudy which
  wording he wants on the button. The video ends on "Book your setup").
- Fields: **email (required)**. Optional, ask Rudy before adding: first name, and "What would you
  use OPUS for?" (Personal / Business / Both).
- After signing up, show a clear thank-you message ("You're on the list. We'll be in touch.").
- Rudy must be able to **see the list of sign-ups** easily (see section 9, question 3).
- Add a short privacy line under the form ("We'll only use your email to contact you about
  OPUS. No spam.") and a simple privacy page. Include a consent checkbox if Rudy wants to email
  people marketing updates later. Ask him.
- Basic spam protection on the form (for example a hidden "honeypot" field and server-side
  email checks). Don't add anything that needs a paid service without asking.

## 4. Suggested page outline

1. **Hero:** headline + one-line explanation + email form + the promo video.
   - Headline ideas from the video: "Your personal assistant, one call away." / "Just say it."
   - Sub-headline: "OPUS is an AI assistant with its own phone number. No app to download.
     Call it or text it, and it gets things done."
2. **How it works:** the 3 steps above, each with a phone-style visual (a call bubble or text bubble).
3. **What people use it for:** the parent / small business / office / student examples as cards.
4. **Every day:** email, calendar, research, texting people for you.
5. **Safe by design:** your okay, your code word, only your number, scam screening.
6. **FAQ:** "Do I need an app?" (No, just a phone number.) "Can I call it or only text?" (Both.)
   "What can it do?" "Is it safe?" "How do I get it?" (Book your setup.) Don't make up answers
   to anything not in this brief; ask Rudy.
7. **Final call to action:** the email form again.
8. **Footer:** GETOPUS.ONLINE, privacy page link, contact (ask Rudy which email to show).

## 5. Look and feel (match the promo video)

The promo video sets the style. Look at `final/poster-call.jpg` and `final/poster-end.jpg`
(section 7) and copy that look:

- **Bright, friendly, clean.** Flat solid background colors per section, lots of white space.
  Not dark or "techy".
- **Colors:** paper `#f2f0ea`, ink `#121214`, brand cobalt blue `#2d5bff`, and accents yellow
  `#ffd640`, mint `#7fe3b8`, orange `#ff8a3d`, pink `#ffadc6`, sky `#8fb4ff`, lilac `#c4b5fd`.
- **Type:** "Inter Tight" (Google Fonts) at weight 500 for big headlines with tight letter
  spacing (about -0.04em); "JetBrains Mono" for small labels (like `// how it works`).
  Highlight one key word per headline with a solid colored box behind it (cobalt or ink, white text).
- **Cards and buttons:** white cards with a thick black outline (5px) and a hard offset shadow
  (`12px 12px 0` black), rounded corners. Buttons the same way, cobalt with white text.
- **Mascot:** a friendly 3D blue "O" character with big black eyes, rendered in a pixel-dot
  (dithered) style. Several poses are provided (section 7). Small pixel-dot blue rings ("coins")
  work as decoration.
- Mobile first: most visitors will come from the vertical video on phones.

## 6. Ground rules

- **Do not use real phone numbers.** Rudy's own OPUS line is private. Don't publish it. In
  examples, use fake numbers like (555) 010-OPUS.
- **No fake testimonials, user counts, reviews or "as seen on" logos.** Nothing invented.
- **Don't show prices or dates** unless Rudy gives them.
- **Keep it separate from Rudy's other projects.** Make a new project/repository for the landing
  page. Don't modify the `WizKid1968/Task-Line` repository or its live server
  (`task-line-phi.vercel.app`); that runs Rudy's actual assistant.
- **Don't store sign-ups in Rudy's "Task-Line" Airtable base.** It holds his assistant's security
  records. If Airtable is used, it must be a new, separate base.
- **Secrets** (any API key or token) go only in the hosting provider's environment variables,
  never in code or GitHub.
- **Ask before** connecting the domain, publishing, buying anything or adding a paid service.
- **Hosting note:** Vercel's free Hobby plan is meant for non-commercial use. A page that sells a
  product may need a paid plan or another host. Tell Rudy and let him decide.

## 7. Assets you can use

All in the GitHub repository **`WizKid1968/Task-Line`**, branch
**`claude/telnyx-personal-agent-workflow-jtg7cu`**, folder **`marketing/opus-promo/v2/`**:

- `final/opus-promo.mp4`: the final promo video (vertical 1080x1920, 80 seconds, with voice-over
  and music). Use it in the hero. Compress a web version, and make it play muted with a "tap
  for sound" option, since browsers block autoplay with sound.
- `final/poster-call.jpg`, `final/poster-end.jpg`: stills from the video, as style references
  or a video poster image.
- `assets/mascot/wave.png`, `cheer.png`, `hold.png` (holding a phone), `point.png`, `think.png`,
  `face.png` (head only, good for small badges). Transparent PNGs; display them with
  `image-rendering: pixelated` so the dots stay crisp.
- `assets/objects/ring.png`, `ring-big.png`: the blue pixel-dot O rings.
- `index.html`: the video's source, if you want exact styles (colors, card CSS).

If you can't access the repository, ask Rudy to send you the files.

**Music in the video** was made with Suno. Rudy should confirm his Suno plan includes commercial
rights before the video is used publicly.

## 8. Done means

- The page works on phone and desktop; check both sizes and send Rudy screenshots.
- A test sign-up appears in the place Rudy chose, and Rudy can see it there.
- The form rejects an invalid email and shows a friendly error.
- The privacy line, privacy page and footer are in place.
- Nothing is published or connected to GETOPUS.ONLINE until Rudy approves the preview.

## 9. Ask Rudy before building

1. **Domain:** does he already own `getopus.online`, and where is it registered?
2. **Hosting:** where should the page live (Vercel, here.now, or another host)? Does he have an
   account there?
3. **Where should sign-ups be saved** so he can see them? Options: a new Airtable base (not the
   Task-Line one), a Google Sheet, or the host's own form or database feature. Does he want an
   email notification for each new sign-up?
4. **Button wording:** "Get early access", "Join the waitlist" or "Book your setup"?
5. **Extra fields:** just email, or also first name and "personal / business / both"?
6. **Contact email** to show in the footer and privacy page.
