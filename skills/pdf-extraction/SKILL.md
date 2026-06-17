---
name: pdf-extraction
description: Extract structured data from PDFs — text vs scanned, table extraction, OCR fallback, layout heuristics, and validation/QA.
ephemeral: true
evict-after: used
evict-keep-tokens: 30
---

# PDF Data Extraction Primer

Step-by-step guidance for reliably extracting structured data from PDF documents, handling both native-text and scanned (image-only) sources.

---

## 1. Classify the PDF first

Before choosing a tool, determine what kind of PDF you have — this controls every downstream decision.

| Type | How to detect | Extraction path |
|------|---------------|-----------------|
| Native text | `pdfminer` / `pypdf` returns non-empty text | Direct text extraction |
| Scanned (image-only) | Text extraction returns empty or garbage | OCR pipeline |
| Hybrid (text + images) | Some pages have text, others are images | Mixed: text pass first, OCR for image pages |
| Form (AcroForm) | Field annotations present | Form-field API (`pypdf`, `pdfplumber`) |

Quick classifier:

```python
import pdfplumber

def classify(path: str) -> str:
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            if page.extract_text():
                return "text"
        return "scanned"
```

---

## 2. Native text extraction

Use `pdfplumber` for most tasks — it preserves spatial layout and handles overlapping text better than `pypdf` for complex documents.

```python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    for page in pdf.pages:
        text = page.extract_text(x_tolerance=3, y_tolerance=3)
        # text is a string with newlines preserved
```

**Gotchas:**
- Multi-column layouts produce interleaved lines. Use `page.extract_text(layout=True)` (pdfplumber ≥0.10) or split columns manually with bounding-box crops: `page.crop((x0, y0, x1, y1)).extract_text()`.
- Ligatures (`ﬁ`, `ﬂ`) may not round-trip to ASCII — normalise with `unicodedata.normalize("NFKD", text)`.
- Headers and footers repeat across pages — strip by y-coordinate range before processing body text.

---

## 3. Table extraction

PDFs do not have a native table type — tables are reconstructed from lines, whitespace, or column alignment.

### With explicit ruling lines (most common)

```python
with pdfplumber.open("document.pdf") as pdf:
    for page in pdf.pages:
        tables = page.extract_tables()
        for table in tables:
            # table is List[List[str | None]]
            headers, *rows = table
```

Tune `table_settings` when the default heuristics mis-detect columns:

```python
settings = {
    "vertical_strategy": "lines",
    "horizontal_strategy": "lines",
    "snap_tolerance": 3,
    "join_tolerance": 3,
}
page.extract_tables(table_settings=settings)
```

### Without ruling lines (whitespace-aligned tables)

Switch to `"text"` strategy:

```python
settings = {
    "vertical_strategy": "text",
    "horizontal_strategy": "text",
    "min_words_vertical": 3,
}
```

This is fragile for dense documents. Consider Camelot (`camelot-py`) or Tabula as alternatives — Tabula uses a Java backend and is more robust for whitespace tables.

### Post-processing tables

1. Drop all-None rows (table padding artefacts).
2. Forward-fill merged cells (a cell spanning multiple rows appears in the first row only; copy it downward).
3. Coerce numeric strings: strip currency symbols, thousands separators, then `float()`.
4. Tag each row with the page number and bounding box for provenance.

---

## 4. OCR fallback for scanned PDFs

When the PDF is image-only, convert pages to images and run OCR.

```python
from pdf2image import convert_from_path
import pytesseract

images = convert_from_path("scan.pdf", dpi=300)
pages_text = []
for img in images:
    text = pytesseract.image_to_string(img, lang="eng", config="--psm 6")
    pages_text.append(text)
```

**Key parameters:**
- `dpi=300` is the minimum for acceptable accuracy on body text; use 400–600 for small fonts or fine print.
- `--psm 6` (uniform block of text) is the default. Switch to `--psm 3` (fully automatic) for mixed layouts, or `--psm 4` for single-column variable-size text.
- Pre-processing improves accuracy dramatically: deskew, despeckle, binarise with Otsu thresholding (`cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)`).

### OCR table extraction

After OCR, the text is unstructured. For structured tables in scanned PDFs, use `pytesseract.image_to_data()` which returns word-level bounding boxes, then cluster by `(left, top)` proximity into rows and columns. Libraries like `easyocr` and `doctr` provide layout-aware extraction and handle this automatically.

---

## 5. Layout heuristics

Use spatial reasoning to locate known sections reliably:

1. **Anchor on landmarks**: find a heading like "Invoice Total" by text match, then extract the value to its right or below within a fixed bounding box.
2. **Relative coordinates**: express field locations as offsets from the anchor, not absolute page coordinates — this survives layout shifts across document versions.
3. **Font-size signals**: headings are typically the largest text on a page. Use `page.chars` (pdfplumber) to filter by `size` and reconstruct the document outline.
4. **Column detection**: build a histogram of x-coordinates of text starts; peaks indicate column left-edges.

---

## 6. Validation and QA

Raw extraction is never 100% reliable. Always validate before storing:

1. **Schema validation**: define expected fields, types, and ranges. Reject documents that are structurally wrong rather than silently storing garbage.
2. **Cross-field checks**: totals should equal the sum of line items ± rounding tolerance; dates should be in chronological order.
3. **Confidence thresholds**: OCR engines return per-word confidence. Flag any field where average confidence < 85% for human review.
4. **Fuzzy deduplication**: the same document may arrive multiple times. Hash a stable subset of fields (invoice number + date + total) and reject duplicates.
5. **Audit trail**: store `(source_path, page_number, bounding_box)` alongside each extracted value so discrepancies can be traced back to the source.

### Human-in-the-loop triage

For high-stakes extraction (financial, legal): route low-confidence records to a review queue automatically. Track acceptance rate per document type; drop below 90% → retraining signal.
