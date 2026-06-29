# AppTracker

A co-op/internship application tracker. This glossary covers domain language specific to AppTracker; it is not a spec or a list of implementation decisions.

## Cover Letter

**Layout Profile**:
The set of visual style attributes recovered from an uploaded cover letter — page size, margins, approximate body font size, line spacing, and a coarse serif/sans font class. It is distinct from both the original PDF's bytes and its extracted text: it describes *how* the letter looked, not *what* it said. Used to re-render a tailored letter in the same visual style. (It deliberately does not capture a "header" — the name/address/date are part of the letter's text and render in place on their own — nor alignment, which is always left in the first build.)
_Avoid_: format, style, template
