# Render cover-letter PDF export with @react-pdf/renderer

The cover-letter export feature re-renders a Claude-tailored letter as a PDF that reproduces the *style* of the user's originally uploaded letter (its Layout Profile: margins, alignment, font size, line spacing), reflowing the new text into that style rather than pixel-matching the original. We render this entirely client-side with `@react-pdf/renderer`.

We chose react-pdf because export is fundamentally a **text-reflow** problem — the tailored text differs in length from the original, so lines, paragraphs, and page breaks must re-layout automatically. react-pdf is the only client-side option with a real layout engine, and its style props (`margin`, `fontSize`, `lineHeight`, `textAlign`, `fontFamily`) map almost directly onto the Layout Profile. Its `Font.register()` API is also the seam through which future font-matching (Tier 2) can be added without a rewrite.

## Considered Options

- **`pdf-lib`** — rejected. It draws text at fixed coordinates with no automatic wrapping or pagination; using it for reflow means hand-building a text layout engine. It is the right tool only for fixed-position *overlay*, an approach we explicitly rejected because reworded text overflows the original's positions.
- **HTML/CSS → PDF client-side (`html2pdf.js`, `jsPDF.html`)** — rejected. The common `html2canvas` path rasterizes the page, producing blurry, non-selectable text and unreliable pagination — unacceptable for a document meant to look professional.
- **Server-side headless Chrome (Puppeteer/Playwright)** — rejected. Highest CSS fidelity, but contradicts the decision to keep export stateless and client-side, and adds a heavy serverless dependency (large binary, cold starts) on Vercel.

## Consequences

- The export layer is expressed as react-pdf components; swapping renderers later would mean rewriting that layer.
- Tier 1 maps the inferred font to react-pdf's built-in standard families (Helvetica/Times/Courier); non-standard fonts require `Font.register()` with a hosted font file, deferred to Tier 2.
