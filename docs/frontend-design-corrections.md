# Frontend Design, corrections after the accessibility and language pass

Drop-in replacements for the sections of *Vuka Frontend Design* that the branch
`accessibility-and-languages` made wrong. Section numbers match the document. Everything not
listed here is unaffected and still accurate.

All figures below are measured rather than estimated. The method is in
`docs/../README.md` under The low-bandwidth surfaces, and the measurements can be reproduced
from the templates in `src/main/resources/templates/`.

---

## Summary of what changed and why it matters

| Section | Claim in the document | State now |
|---|---|---|
| §3, J2 step 2 | "Signs in. One email field, one password field" | **Was wrong, now true.** `/m/signin` is exactly that. See the blocker section below |
| §5, route gating | `/m/**` gated to `ENTITY_REPORTER` | **Was described but not enforced.** The config required only authentication. Now enforced |
| §5, screen inventory | six Thymeleaf views | **Eight.** Sign-in and the submission receipt are new |
| §10 | Design tokens, light only | **Incomplete.** Every template ships a dark theme. The token table needs its dark column |
| §11 | Page weight table, six figures | **Superseded.** All six moved. All six still pass |
| §11 | "Focus visible: 2px brand-light outline, never removed" | **Was false, now true.** `outline:none` was live in `mobile-step.html`. Now a 3px ring |
| §11 | "Language declared `lang="en-ZA"` on every page" | **Was false, now partly true.** Templates carried `lang="en"`. Citizen pages now carry the served language |
| §11 | "We do not claim multilingual support" | **Superseded.** Five languages ship on the citizen surface |
| §11 | Contrast figures | **Understated, and one pair failed.** Corrected below, dark mode added |
| §12 | Demo path step 5, "Submit on a phone" | **Blocked.** See the blocker below |
| §5, Surface A | The citizen view is one server-rendered surface | **Superseded.** Two views at one address, light and full, chosen by connection or by the reader. See "Two citizen views and offline" below |
| §11 | Every low-bandwidth page under 5KB | **No longer true for two pages.** `mobile-step.html` and `public-entity.html` render at 5.8KB and 6.0KB. Both gzip to 2.3KB |
| (none) | Offline behaviour | **New.** Every surface works with no connection within stated limits. See below |

---

## The blocker, now closed

The mobile reporter flow could not be used from a browser at all. Two independent faults, both
fixed:

1. `FirebaseTokenFilter` read only an `Authorization: Bearer` header, which a browser navigation
   cannot send, so every page under `/m` answered 401. It now also accepts the token from a
   cookie, header first.
2. `POST /m/submission/{id}/step/{index}` and `POST /m/submission/{id}/submit` had no handler, so
   the templates posted into a 405. Both exist now, and both write through `SubmissionService` so
   a figure captured on a phone lands with the same named confirmer as one parsed out of a
   spreadsheet.

**§3, J2 step 2 is now accurate.** It describes "one email field, one password field" and that is
what `/m/signin` is. The server exchanges the credentials for a Firebase ID token rather than the
client SDK doing it, because the SDK is about 100KB on the one page whose argument is that it
costs almost nothing to open. The honest cost, which belongs in the security conversation: the
password transits our server. It is never logged and never stored.

**What the document should add to §5, route gating.** Two rows changed and one is a fix rather
than an addition:

| Pattern | Who reaches it |
|---|---|
| `/m/signin` | everyone, unauthenticated. The form has to be reachable to be used |
| `/m/**` | `ENTITY_REPORTER` only, and this is now enforced rather than described |

The second was the real hole. The document specified `ENTITY_REPORTER`; the configuration required
only authentication, and `VukaPrincipal.canRead` returns true for every DSAC role. A reviewer could
have confirmed a figure on an entity's behalf, which §2 lists under what a reviewer must never be
able to do.

**Two more things the document should carry.** CSRF protection is now on for `/m/**` and off for
`/api/**`, because the first authenticates from a cookie the browser attaches by itself and the
second from a bearer token it does not. The cookie is `HttpOnly`, `SameSite=Strict` and `Secure`
when the request is, and holds the ID token only, never the refresh token, so a session lasts an
hour. Expiry costs the reporter almost nothing because each step is written as it is answered and
the sign-in redirect carries the path they were on, which is the same URL-carries-the-state
property J2 step 5 already relies on.

**Consequence for §12.** Demo path step 5, "Submit on a phone. Hand the phone to a judge", is back
on the table, subject to the caveat in *What is still outstanding* below.

---

## §10, design tokens: add the dark column

The document lists one theme. Every template ships two, switched on
`prefers-color-scheme` with a `data-theme` override. The dark theme is not decoration: a reader
on a phone at night gets it by default, and it is where the one contrast failure was hiding.

```
                    light        dark        role
ink                 #1A1A1A      #E8EDEB     body text
ink-muted           #5A6B64      #9BB0A7     secondary text, citations
rule                #DFE6E3      #2B3A34     borders, dividers
canvas              #FFFFFF      #121714     page
canvas-sunk         #F4F8F6      #1A221E     cards, panels
brand               #0F3D2E      #7FD1B0     headings, links, primary buttons
on-brand            #FFFFFF      #121714     text and icons on a brand-coloured fill
input               #FFF8C4      #3A3520     text input fill
```

Two notes for whoever reconciles this with the document's existing table. The document lists
`rule` as `#D8E0DC`; the templates use `#DFE6E3`, and the templates are the source of truth. The
document lists a `brand-light #17614A` that no template uses.

**`on-brand` is new and it is the fix for a real failure.** The templates previously hard-coded
white on `brand` for primary buttons. In light mode that is 12.16:1. In dark mode, where `brand`
becomes a light mint, it measured **1.80:1** against a 4.5 threshold. Any token that sits on a
brand-coloured fill has to invert with the theme, so it is a token rather than a literal.

---

## §11, replacement section

### The page weight budget

Measured, not aspirational. Figures are the rendered HTML with Thymeleaf attributes resolved, which
is what is actually served, and gzip is on in `application.yml` with a 512 byte floor.

| Surface | Budget | Rendered | Gzipped | What is in it |
|---|---|---|---|---|
| `mobile-message.html` | 5KB | **694 B** | 465 B | one sentence, announced as a status |
| `mobile-done.html` | 5KB | **2 236 B** | 1 188 B | submission summary, before the irreversible click |
| `mobile-submitted.html` | 5KB | **2 121 B** | 1 053 B | the receipt. New |
| `mobile-home.html` | 5KB | **3 846 B** | 1 530 B | period, indicator list, progress, documents and comments cards, sign out |
| `mobile-signin.html` | 5KB | **3 290 B** | 1 490 B | one email field, one password field. New |
| `public-index.html` | 5KB | **4 086 B** | 1 715 B | every published entity, the language switcher, the link to the full view |
| `public-entity.html` | 5KB | **6 001 B, over** | 2 259 B | the full accountability chain, the language switcher, the link to the full view |
| `mobile-step.html` | 5KB | **5 832 B, over** | 2 303 B | one indicator, input, note |
| `mobile-workspace.html` | 5KB | **4 490 B** | 1 816 B | upload form, documents, tasks, the receipt. New |
| `mobile-document.html` | 5KB | **4 912 B** | 1 762 B | receipt, hash, decision, Microsoft state, three versions. New |
| `mobile-comments.html` | 5KB | **2 357 B** | 1 061 B | every comment thread for the entity, open ones first. New |
| `mobile-thread.html` | 5KB | **4 908 B** | 2 092 B | one thread of three comments, reply form, inline poller. New |
| React dashboard | 250KB gzipped | 137KB | | office users only, never on the reporter path |
| Full citizen view | not in the document | 55KB | | served only where the connection can carry it; the light view is the budgeted page |

Eight surfaces now, not six. Figures include the hidden CSRF field injected into every form, which
costs about 96 bytes.

The eight rows marked in bold with a new figure were remeasured on 18 September 2026 against the
seeded demo data, before and after the offline layer, rendering the pre-change templates and the
current ones through the same engine. The offline layer added 54 B to every phone page (the script
tag), 170 B to `mobile-step.html` (the step addresses it prefetches), and 350 B and 510 B to the two
citizen pages (the translated offline notice, the link to the full view, and `view=lite` on every
link). The rest of the growth since the first table came from earlier work that was never
remeasured, and **`mobile-step.html` and `public-entity.html` were already over 5KB rendered before
the offline layer**, at 5 662 B and 5 647 B. Gzipped, which is what reaches the phone, the heaviest
page is 2.3KB. The rows not remeasured (`mobile-message`, `mobile-submitted`, `mobile-document`,
`mobile-thread`) each carry the same extra 54 B.

The two workspace pages were measured with the data in the row, rendered through the same
Spring Thymeleaf engine, and the workspace figure includes the 96 byte CSRF field for its one form.
Both sit within about 130 bytes of the budget with that data, and both grow with the number of
documents or versions listed, so a long history is the case to watch. `mobile-home.html` gained
the Documents and Comments cards after the figure above was taken; rendered against the same model
before and after, they add 442 bytes, which leaves it near 3.4KB.

No web fonts, no icon fonts, no framework, no images on any low-bandwidth surface. Inline CSS,
because a separate stylesheet is a second request and on a bad connection the second request is
the one that fails. The full citizen view is React, and is not a low-bandwidth surface: it is only
served where the connection can carry it, and the light view is always one link away.

The two citizen pages grew when the language switcher landed, `public-index.html` by about a
kilobyte. Both are still comfortably inside budget and both gzip under 2KB. Room was made by
deleting a comment block from `mobile-step.html` that duplicated what `MobileController` already
documents.

**What that buys, stated the way it should be said out loud.** On a 2G connection at roughly
50 kbit/s, every one of these arrives in under a second. A 2MB React bundle takes about five
minutes and will usually fail first.

### Accessibility, specifically

WCAG 2.1 AA, and the parts that actually get tested. Two of these rows previously described an
intention rather than the code, and both are now true.

| Requirement | How it is met |
|---|---|
| Contrast 4.5:1 on body text | Measured across both themes. Worst pair is 5.27:1, `ink-muted` on `canvas-sunk` in light mode. Body text is 17.40:1 light, 15.32:1 dark |
| Contrast 4.5:1 on UI fills | `on-brand` on `brand` is 12.16:1 light and 10.06:1 dark. This pair previously measured 1.80:1 in dark mode and was the one real failure |
| Contrast 3:1 on large text and borders | `brand` on `canvas` is 12.16:1 light, 10.06:1 dark |
| Colour is not the only carrier | every risk band shows score, word and swatch together |
| Keyboard reachable | server-rendered surfaces are plain forms and links, so this is free rather than engineered |
| Focus visible | 3px `brand` outline with a 3px offset, on links, inputs and buttons. Buttons draw their ring in `ink` because a brand ring on a brand fill is invisible. `outline:none` was live on the inputs in `mobile-step.html` and is gone. Do not put it back |
| Labels tied to inputs | explicit `for` and `id` on every field, no placeholder-as-label anywhere |
| Hints and errors announced | every hint is a real element referenced by `aria-describedby`, not text sitting loose near the field |
| Landmarks and skip links | every page has a skip link as its first focusable element and a `main` landmark to skip to |
| Semantic structure | entity and indicator lists are `ul`/`li`, the citizen figures are a `table` with `th scope="row"` and a caption, not styled `div`s |
| Language declared | the citizen pages declare the language actually served. The reporter pages declare `en` |
| Zoom to 200% | single column layouts, no fixed heights, no horizontal scroll |
| Touch targets | 44px minimum, including the language switcher links, which needed a `min-height` to reach it |

### Language

**This replaces "We do not claim multilingual support".** That position was correct when it was
written and it is not correct now.

The citizen pages are served in English, Afrikaans, isiZulu, isiXhosa and Sesotho. The language is
carried as a `lang` query parameter rather than a cookie or a session, for the same reason the
mobile flow keeps its step index in the URL: the page stays cacheable, a forwarded link opens in
the language it was shared in, and a surface built to be narrow and non-personal does not start
storing preferences about readers who never signed in. `LocaleConfig` holds the supported set and
resolves in one order, explicit parameter, then `Accept-Language`, then English. Adding a language
is a properties file and one list entry.

**What we claim, exactly.** Five of twelve official languages, on the citizen surface only,
demonstrating that the surface carries languages rather than that the set is complete. The
reporter and reviewer surfaces are English, because a half-translated form is worse than an
untranslated one. The remaining seven languages are a translation job rather than an engineering
one, and PanSALB, which is in the seeded portfolio, is the obvious partner for that.

**What we do not claim.** The translations have not been reviewed by first-language speakers.
Say that before someone asks. An implementation of the language surface is a different and
smaller claim than certified government text, and it is the one that holds.

### Two claims we still do not make

**We do not claim screen reader testing.** The markup is built to be screen reader friendly and
nobody has run it through NVDA or VoiceOver. Say built for, not tested with. An accessibility
claim that fails a live check is worse than a smaller claim that holds.

**We do not claim the reporter path is a bandwidth story.** It is a capacity story. A finance
officer at Iziko is at a desk on institutional wifi, and a judge will say so. What is true is that
six of the funded bodies are two or three people for whom reporting competes directly with
delivering the service, and ten short screens finished on a phone between other work is a
different proposition to an afternoon with a spreadsheet. Requirement (d) asks for full
functionality on mobile devices regardless. The bandwidth argument is real on the citizen page,
where the reader has no login, no training and no reason to be patient, and it should be made
there.

### Why the citizen surface carries the inclusivity argument

WhatsApp was the original plan for reaching small entities and it is not achievable here, for the
reasons the document already gives. With the reporter flow blocked on authentication, the citizen
page is the surface that is measured, that works on a judge's own phone during the presentation
with no login, and that now answers two of the criterion's three groups rather than one.
`SubmissionChannel` retains a `WHATSAPP` value so the path stays open, and that is the extent of
the claim.

---

## §5, Surface A: route note

The two public routes accept an optional `lang` parameter:

| View | Route |
|---|---|
| Public index | `GET /public` and `GET /public?lang={en\|af\|zu\|xh\|st}` |
| Public entity | `GET /public/entity/{id}` and the same with `?lang=` |

An unrecognised or malformed value falls back to `Accept-Language` and then to English rather
than erroring, which is verified across fourteen cases including `zu-ZA` resolving to `zu`.

---

## §9, W12 and W13: the switcher belongs in the wireframes

Both citizen wireframes should carry the switcher as their last element, below the citation lines,
and W13's `lang` attribute changes with it.

```
│  ──────────────────────────────────────────────────────── │
│  Only bodies the Department has chosen to publish appear   │
│  here. Allocations are from Vote 37, Table 37.3.           │
│                                                            │
│  Language                                                  │
│  English  Afrikaans  isiZulu  isiXhosa  Sesotho            │
└────────────────────────────────────────────────────────────┘
```

The current language is marked with `aria-current` and shown in bold rather than by colour alone,
which is the same rule §10 already applies to risk bands.

---

## What is still outstanding

1. **Nothing here has run against a live server.** There is no Maven on the build machine, so
   none of this has been compiled, let alone exercised. The first thing to check on the mobile
   flow is that the CSRF hidden field renders: view source on a step page and look for
   `name="_csrf"`. Thymeleaf injects it through Spring Security's `RequestDataValueProcessor`
   into any form with a `th:action`, which is the standard mechanism and the only one available
   since Thymeleaf 3.1 removed request-attribute access from templates. If it is absent, every
   POST under `/m` answers 403 and the field has to go in by hand. Budget ten minutes for this
   before the dry run, not during it.
2. **`FIREBASE_WEB_API_KEY_FILE` has to be set** for reporter sign-in to work at all, and it
   points at a file holding the key rather than carrying the key itself. Unset, sign-in reports
   that it is unavailable and the citizen view is unaffected.
3. **There is no `/admin/**` rule in the security configuration.** §5 gates it to `ADMIN`. No
   admin controller exists yet so the paths 404, but when one lands it inherits
   `anyRequest().authenticated()` and a reporter reaches it. Add the rule before the screen.
4. **Native-speaker review of the five translations.**
5. **Screen reader pass.** The markup is built for it and has not been tested with it. One hour
   with VoiceOver would convert "built for" into "tested with", which is a materially stronger
   sentence in the room.
6. **The reporter and reviewer surfaces are not translated**, and the document should say so
   rather than leaving the language claim to be read as covering the whole product.

---

## Live comments, and where they depart from the document

**UC-14 said "a thread per entity per period". It is a thread per figure.** Every comment is
anchored to a target, a confirmed result or a document version, and the workspace view is those
threads grouped. That is FR-4.2 of the build guide, and it is the J3 point made in the schema:
a comment on the whole filing makes the entity guess which number is disputed.

**§12, cut 5 ("Entity workspace comments, real requirement, weak demo") is built rather than
cut.** On the phone at `/m/comments`, and on the office dashboard as a tenth component,
`CommentPanel`, on the reporter's extraction review and the reviewer's submission review. The
panel adds about 1.5KB gzipped to the dashboard bundle.

**"Visible in real time" is a five second poll, as the PRD said.** Every read carries an ETag, and an
unchanged poll is a 304 with no body that reads no comment rows. The thread page carries the poller,
and it is correct without it. Every page on these surfaces now also carries the offline layer's
script (see below), and is equally correct without that.

**`mobile-thread.html` is the one page whose weight depends on the conversation.** The row above
is three comments of realistic length. Empty, it is 4 007 B and 1 811 B gzipped. Each comment adds
about 300 B rendered, so a thread passes the 5KB budget at about four comments, and gzipped it sits
just over 2KB from three. The `/live` poll it makes is a bodiless 304 while nothing changes and
about 380 B gzipped when something does.

**A dispute is no longer "any comment on the target".** Once comments could be answered and closed
that rule became wrong: a reporter's "corrected" would have been shown back to them as the
Department disputing the figure. A dispute is now an open comment, written by a DSAC role, that
opened a thread on a target.


---

## Two citizen views and offline

Added after the language pass. The full description, including the rules that make offline safe, is
in the top-level README under "Two citizen views" and "Offline". What changes in this document:

**§5, Surface A is two views at one address.** `/public` and `/public/entity/{id}` serve either the
light view (these templates) or the full view (React, `frontend/citizen.html`). `CitizenSurface`
chooses: `?view=lite` or `?view=rich` if the reader chose, then `Save-Data`, then the `ECT` and
`Downlink` client hints, else the full view, which checks `navigator.connection` again in the
browser and falls back after ten seconds if its bundle has not started. The choice is a query
parameter, like `lang`, and never a cookie. Both views read the same `PublicationService`
projection and the same five translation files, and both 404 an unpublished entity.

**§11, "no JavaScript" on the low-bandwidth surfaces is now "no required JavaScript".** Each page
registers a service worker, the citizen pages with one inline line and the phone pages through
`/offline/mobile.js` (2.9KB gzipped, fetched once). With scripts off every page behaves as before.

**Offline is new, and scoped per audience.** A citizen reads any page already read on the device,
dated. A reporter on the phone keeps answering with no signal, including indicators never opened,
and the answers are sent in order when the signal returns, under the same reporter's session or not
at all. On the dashboard, DSAC staff and entity reporters open every screen already visited, and
comments, reviews, confirmations, submissions, task moves and document decisions made offline are
kept, listed and sent later. Uploads, opening a period, setting a task, publication and recompute
are never kept. Sign-out deletes what was kept for that person.
