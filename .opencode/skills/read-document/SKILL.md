---
name: read-document
description: Read and extract text from document files (.docx, .pdf, .xlsx, .pptx, .csv, .rtf, .odt, .epub, .html) into plain text or markdown for editing
---

## What I do

Convert binary and rich document formats into plain text or markdown that agents can read, edit, and work with. I use Python libraries already installed on this system.

## Supported formats

| Format | Extension | Python library |
|--------|-----------|---------------|
| Word | .docx | mammoth (to markdown) or python-docx (raw text) |
| PDF | .pdf | pdfplumber (with layout) or pypdf (fast text) |
| Excel | .xlsx, .xls | openpyxl |
| PowerPoint | .pptx | python-pptx |
| CSV | .csv | built-in csv module |
| HTML | .html, .htm | beautifulsoup4 + markdownify |
| Rich Text | .rtf | striprtf (if installed) |
| OpenDocument | .odt | odfpy (if installed), otherwise unzip + xml parse |
| EPUB | .epub | ebooklib (if installed), otherwise unzip + html parse |

## How to use me

Run the appropriate Python one-liner or short script via the Bash tool. Always quote paths with spaces.

### Word (.docx) to Markdown

```bash
python -c "
import mammoth, sys
with open(sys.argv[1], 'rb') as f:
    result = mammoth.convert_to_markdown(f)
    print(result.value)
" "path/to/document.docx"
```

### Word (.docx) to plain text (preserves structure)

```bash
python -c "
from docx import Document
import sys
doc = Document(sys.argv[1])
for p in doc.paragraphs:
    print(p.text)
for table in doc.tables:
    for row in table.rows:
        print(' | '.join(cell.text for cell in row.cells))
" "path/to/document.docx"
```

### PDF to text (with layout preservation)

```bash
python -c "
import pdfplumber, sys
with pdfplumber.open(sys.argv[1]) as pdf:
    for page in pdf.pages:
        text = page.extract_text()
        if text:
            print(text)
        print('---')
" "path/to/document.pdf"
```

### PDF to text (fast, less formatting)

```bash
python -c "
from pypdf import PdfReader
import sys
reader = PdfReader(sys.argv[1])
for page in reader.pages:
    print(page.extract_text())
" "path/to/document.pdf"
```

### Excel (.xlsx) to text table

```bash
python -c "
from openpyxl import load_workbook
import sys
wb = load_workbook(sys.argv[1], read_only=True, data_only=True)
for sheet in wb.sheetnames:
    ws = wb[sheet]
    print(f'## Sheet: {sheet}')
    for row in ws.iter_rows(values_only=True):
        print(' | '.join(str(c) if c is not None else '' for c in row))
    print()
" "path/to/spreadsheet.xlsx"
```

### PowerPoint (.pptx) to text

```bash
python -c "
from pptx import Presentation
import sys
prs = Presentation(sys.argv[1])
for i, slide in enumerate(prs.slides, 1):
    print(f'## Slide {i}')
    for shape in slide.shapes:
        if shape.has_text_frame:
            for para in shape.text_frame.paragraphs:
                print(para.text)
    print()
" "path/to/presentation.pptx"
```

### CSV to markdown table

```bash
python -c "
import csv, sys
with open(sys.argv[1], newline='', encoding='utf-8-sig') as f:
    reader = csv.reader(f)
    rows = list(reader)
    if rows:
        print(' | '.join(rows[0]))
        print(' | '.join('---' for _ in rows[0]))
        for row in rows[1:]:
            print(' | '.join(row))
" "path/to/data.csv"
```

### HTML to Markdown

```bash
python -c "
from markdownify import markdownify
import sys
with open(sys.argv[1], encoding='utf-8') as f:
    print(markdownify(f.read(), heading_style='ATX'))
" "path/to/page.html"
```

## When to use me

- User asks to read, import, review, or edit a .docx, .pdf, .xlsx, .pptx, .csv, or .html file
- User drops a document file into the project and wants it analyzed
- User wants to convert a document to markdown for editing
- Any time you encounter a binary file format that the Read tool cannot handle

## Important notes

- Always save extracted text to a .md file in the project so other agents can work with it
- For large PDFs, consider extracting specific pages: add page range logic
- For large Excel files, consider extracting specific sheets only
- If a Python library is missing, install it with: `pip install <package>`
- Always use `sys.argv[1]` for the file path so paths with spaces work correctly
- When editing documents, extract to markdown first, make edits, then inform the user the edited markdown is ready (re-encoding back to .docx requires additional steps)
