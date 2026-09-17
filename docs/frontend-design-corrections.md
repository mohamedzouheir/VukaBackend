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
| §3, J2 step 2 | "Signs in. One email field, one password field" | **Wrong.** No sign-in surface exists for `/m`, and the flow cannot authenticate from a browser at all. See the blocker below |
| §10 | Design tokens, light only | **Incomplete.** Every template ships a dark theme. The token table needs its dark column |
| §11 | Page weight table, six figures | **Superseded.** All six moved. All six still pass |
| §11 | "Focus visible: 2px brand-light outline, never removed" | **Was false, now true.** `outline:none` was live in `mobile-step.html`. Now a 3px ring |
| §11 | "Language declared `lang="en-ZA"` on every page" | **Was false, now partly true.** Templates carried `lang="en"`. Citizen pages now carry the served language |
| §11 | "We do not claim multilingual support" | **Superseded.** Five languages ship on the citizen surface |
| §11 | Contrast figures | **Understated, and one pair failed.** Corrected below, dark mode added |
| §12 | Demo path step 5, "Submit on a phone" | **Blocked.** See the blocker below |

---

## The blocker, which belongs in the document before anything else

**The mobile reporter flow cannot currently be used from a browser.** Two independent faults:

1. `FirebaseTokenFilter` authenticates only from an `Authorization: Bearer` header. A browser
   navigating to `/m` cannot send one, so every page under `/m` answers 401. This is why J2 step 2
   in §3 describes a sign-in screen that does not exist.
2. The two form actions the templates post to, `POST /m/submission/{id}/step/{index}` and
   `POST /m/submission/{id}/submit`, have no handler in `MobileController`. They would answer 405
   even once a caller is authenticated.

The templates, the accessibility work and the page weight budget are real. The service layer
behind them is real and wired end to end. What is missing is a browser-usable way to hold a
session, which means accepting the token from a `SameSite` cookie and turning CSRF protection
back on for the form surface. That is a security decision rather than a piece of plumbing, and it
should be made deliberately.

**Consequence for §12.** Demo path step 5, "Submit on a phone. Hand the phone to a judge", does
not run today, and it is the step the inclusivity argument leans on hardest. It is also listed
under **Never cut**. Either the cookie work happens or step 5 becomes a walkthrough of the
citizen page instead, which does work on a judge's phone with no login and is the stronger
opening in any case.

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
| `mobile-done.html` | 5KB | **1 976 B** | 988 B | submission summary |
| `mobile-home.html` | 5KB | **2 447 B** | 1 061 B | period, indicator list, progress |
| `public-index.html` | 5KB | **3 224 B** | 1 380 B | every published entity, plus the language switcher |
| `public-entity.html` | 5KB | **4 810 B** | 1 877 B | the full accountability chain, plus the language switcher |
| `mobile-step.html` | 5KB | **4 846 B** | 1 886 B | one indicator, input, note |
| React dashboard | 250KB gzipped | to build | | office users only, never on the reporter path |

No web fonts, no icon fonts, no framework, no images on any low-bandwidth surface. Inline CSS,
because a separate stylesheet is a second request and on a bad connection the second request is
the one that fails.

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

1. **The `/m` authentication blocker.** Nothing else on the mobile surface matters until a browser
   can reach it. It also decides whether demo step 5 survives.
2. **Native-speaker review of the five translations.**
3. **Screen reader pass.** The markup is built for it and has not been tested with it. One hour
   with VoiceOver would convert "built for" into "tested with", which is a materially stronger
   sentence in the room.
4. **The reporter and reviewer surfaces are not translated**, and the document should say so
   rather than leaving the language claim to be read as covering the whole product.
