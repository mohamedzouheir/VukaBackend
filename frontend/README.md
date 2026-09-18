# Vuka office dashboard

Surface B of `docs/Vuka-Frontend-Design.pdf`: the reporter's desktop path, the DSAC review queue
and the executive portfolio. Vite, React and TypeScript, talking to the Spring Boot API in the
parent directory.

Two more things live here, and neither is part of the dashboard bundle:

- **The full citizen view**, `citizen.html` and `src/citizen/`. A second Vite entry, so a member of
  the public loads React and one small page (about 55KB gzipped), never the dashboard, its router or
  Firebase. It is served at `/public` when the connection can carry it; the light view is the
  server-rendered Thymeleaf page in the backend. See `web/CitizenSurface.java` for the choice. In
  development, `npm run dev` serves it for any `/public` page request unless `?view=lite` is asked
  for, so both can be compared side by side.
- **The offline layer.** `public/sw.js` is the service worker for every surface, `public/offline/
  mobile.js` is the reporter phone pages' half of it, and `src/lib/offline.ts` keeps the dashboard's
  data per signed-in person and holds changes made with no connection. See "Offline" in the top
  level README for what each audience gets and the four rules that make it safe. The worker is only
  registered in production builds, so test offline against the built jar, not the dev server.

The reporter's phone surface, `/m`, is not here. It is server-rendered Thymeleaf in the backend,
with no framework, and that is deliberate: a small NPO reporting from a phone on mobile data is the
primary user of those pages, not a fallback for them. It carries one optional script, for offline.

---

## Run it

The backend first, on port 8080:

```bash
docker compose up -d
mvn spring-boot:run
```

Then this, on port 5173, which proxies `/api`, `/m` and `/public` through to it:

```bash
cd frontend
npm install
npm run dev
```

### Signing in without a Firebase project

The dashboard needs an identity. If you have a Firebase project, copy `.env.example` to `.env` and
fill in the three `VITE_FIREBASE_*` values, and set the `role` and `entityId` custom claims on a
DSAC user through the Admin SDK. Reporter accounts are issued from the Administration screen
instead; there is no sign up.

If you do not, both sides have a development sign in. It must never be enabled anywhere real.

```bash
# backend
VUKA_DEV_AUTH=true mvn spring-boot:run

# frontend, in .env
VITE_DEV_AUTH=true
```

With the entity field blank, the reporter button signs in as the demo reporter at Iziko, whose Q1
submission the reviewer returns in the demonstration. For any other entity, sign in as a **DSAC
admin** first; the Administration screen prints every entity's uuid under its name. That order matters: a reporter
with no entity id can reach nothing, which is correct behaviour and looks exactly like a bug.

With development sign in on, the application carries a banner on every page and the backend logs a
warning on every start. The filter bean does not exist when the property is false, so there is no
code path to bypass.

---

## Build it into the jar

```bash
npm run build
```

Output goes to `../src/main/resources/static`, so `mvn package` ships one jar serving the API, the
Thymeleaf surfaces and this dashboard from one origin. `SpaController` forwards the dashboard's own
client side routes to the shell so a reload of `/review/{id}` does not 404.

The budget in section 11 of the design is 250KB gzipped. The current build is about 108KB, and
`npm run build` prints the number every time. There are no web fonts, no icon font and no images:
icons are inline stroke SVG in `src/icons/`.

---

## How it is put together

```
src/
  lib/
    api.ts        the fetch client. Collapses 403 into 404, on purpose
    auth.tsx      Firebase identity, plus the development sign in
    types.ts      typed against the Java records, nullable where they are
    format.ts     every formatter treats null as an absence, never as a zero
    useAsync.ts   loading, error and denied as first class states
  components/     the nine components from section 10, each with its five states
  routes/         one file per wireframe, named after it
  icons/          inline stroke SVG line icons
```

### Three rules the code is holding

**A number never appears without its provenance.** `ProvenanceCell` renders the figure and the cell
it came from as one unit. That is why a figure cannot be rendered anywhere without its source
coming with it, and it is the reliability test the Auditor-General applies, built as a component
instead of written as a policy.

**Empty is never zero.** A target with no result renders as "no result reported". The difference
between not done and not reported is the entire subject of this product and a formatter that turns
null into 0 destroys it at the last inch. Every function in `format.ts` returns null rather than a
fallback, and the screens decide what to say.

**Denied is never an error.** A reporter who somehow reaches another entity's submission gets a not
found. Telling a caller that a record exists but is not theirs is itself a disclosure about another
entity. `ApiError.notFound` collapses 403 and 404 into one state in the client, which matches what
`ExportController` already does on the backend.

### What is deliberately not here

There is **no edit screen for a confirmed figure**, and no component that could become one. A
reviewer who disputes a number returns the submission. There is no endpoint behind an edit either,
which is the part that makes it an architecture rather than a promise.

There is **no entity selector for a reporter**. The entity comes off the signed token. A dropdown
would be a way for a client to ask for another entity's data.

There is **no cross sector cost comparison**. A library item and a boxing licence are not
commensurable outputs. The `UnitCost` screen states the absence on the screen rather than in a
footnote, and there is no API parameter that would produce it.

---

## Accessibility

WCAG 2.1 AA is the target and these are the parts that get tested. Contrast is 15.9:1 for body
text, 5.4:1 for secondary text and 11.2:1 for headings on the page background. Risk bands show a
swatch, the score and the band word together, so colour is never the only carrier and a briefing
note survives greyscale. Focus is a 2px outline and is never removed. Every input has an explicit
`for` and `id`, error text sits beside its field and is referenced by `aria-describedby` rather
than shown only as a red border. `lang="en-ZA"` is on the document. Touch targets are 44px on
narrow viewports. Layouts are single column with no fixed heights, so 200 percent zoom does not
produce horizontal scroll.

Two claims not made. This is **not multilingual**: the strings are in the components, and
externalising them is a real task rather than a done one. And it is built for screen readers
rather than **tested with** them, because nobody has run it through NVDA or VoiceOver. An
accessibility claim that fails a live check is worse than a smaller claim that holds.
