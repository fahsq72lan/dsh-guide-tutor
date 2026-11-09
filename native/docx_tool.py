"""Bridge between the guide-tutor knowledge base and Word documents.

The host plugin has no docx library of its own, so it runs this script with the
Python that ships with DSH (python-docx is part of that runtime):

    python docx_tool.py read  <file.docx>          -> {"ok":true,"text":"..."}
    python docx_tool.py write <file.docx>          <- {"text":"# markdown ..."}

Both directions speak JSON on stdout with ASCII escapes, because a Windows
child python would otherwise encode Chinese as GBK and the host decodes UTF-8.
"""

import json
import sys

from docx import Document
from docx.enum.text import WD_LINE_SPACING
from docx.shared import Pt
from docx.table import Table
from docx.text.paragraph import Paragraph

HEADING = '#'


def emit(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=True) + '\n')
    sys.stdout.flush()


def paragraph_markdown(paragraph, counter):
    text = paragraph.text.strip()
    if not text:
        return ''
    style = (paragraph.style.name or '').lower()
    if style.startswith('heading'):
        counter[0] = 0
        level = ''.join(ch for ch in style if ch.isdigit()) or '1'
        level = max(1, min(6, int(level)))
        return '#' * level + ' ' + text
    if style.startswith('list number'):
        # python-docx exposes the style, not the rendered number, so count the
        # run myself; otherwise every item extracts as "1.".
        counter[0] += 1
        return str(counter[0]) + '. ' + text
    counter[0] = 0
    if style.startswith('list'):
        return '- ' + text
    if style.startswith('quote'):
        return '> ' + text
    return text


def table_markdown(table):
    rows = []
    for row in table.rows:
        cells = []
        for cell in row.cells:
            value = cell.text.replace('\n', ' ').strip()
            cells.append(value.replace('|', '\\|'))
        rows.append('| ' + ' | '.join(cells) + ' |')
    if not rows:
        return []
    columns = max(len(row.split('|')) - 2 for row in rows)
    separator = '|' + '|'.join([' --- '] * max(columns, 1)) + '|'
    return [rows[0], separator] + rows[1:]


def read_document(path):
    document = Document(path)
    lines = []
    counter = [0]
    for child in document.element.body.iterchildren():
        tag = child.tag.rsplit('}', 1)[-1]
        if tag == 'p':
            lines.append(paragraph_markdown(Paragraph(child, document), counter))
        elif tag == 'tbl':
            counter[0] = 0
            lines.extend(table_markdown(Table(child, document)))
    # Collapse runs of blank lines: they only cost context.
    cleaned = []
    for line in lines:
        if line == '' and cleaned and cleaned[-1] == '':
            continue
        cleaned.append(line)
    return '\n'.join(cleaned).strip()


def is_table_separator(line):
    body = line.strip().strip('|')
    return body != '' and all(set(cell.strip()) <= set('-: ') for cell in body.split('|'))


def style_document(document):
    normal = document.styles['Normal']
    normal.font.name = 'Microsoft YaHei'
    normal.font.size = Pt(11)
    normal.paragraph_format.line_spacing = 1.35
    normal.paragraph_format.space_after = Pt(4)
    # python-docx only sets the Latin font; East Asian glyphs fall back unless
    # the run declares them explicitly.
    rpr = normal.element.get_or_add_rPr()
    fonts = rpr.find('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}rFonts')
    if fonts is None:
        from docx.oxml.ns import qn
        fonts = rpr.makeelement(qn('w:rFonts'), {})
        rpr.append(fonts)
    from docx.oxml.ns import qn
    fonts.set(qn('w:eastAsia'), 'Microsoft YaHei')


def write_document(path, text):
    document = Document()
    style_document(document)
    lines = text.replace('\r\n', '\n').split('\n')
    index = 0
    in_code = False
    code_lines = []
    while index < len(lines):
        line = lines[index].rstrip()
        stripped = line.strip()

        if stripped.startswith('```'):
            if in_code:
                for code_line in code_lines:
                    paragraph = document.add_paragraph(code_line)
                    paragraph.paragraph_format.space_after = Pt(0)
                    for run in paragraph.runs:
                        run.font.name = 'Consolas'
                        run.font.size = Pt(10)
                code_lines = []
                in_code = False
            else:
                in_code = True
            index += 1
            continue
        if in_code:
            code_lines.append(line)
            index += 1
            continue

        if not stripped:
            index += 1
            continue

        if stripped.startswith('|') and stripped.endswith('|'):
            block = []
            while index < len(lines):
                candidate = lines[index].strip()
                if not (candidate.startswith('|') and candidate.endswith('|')):
                    break
                if not is_table_separator(candidate):
                    block.append([cell.strip() for cell in candidate.strip('|').split('|')])
                index += 1
            if block:
                table = document.add_table(rows=len(block), cols=len(block[0]))
                table.style = 'Table Grid'
                for row_index, cells in enumerate(block):
                    for column_index, value in enumerate(cells[: len(block[0])]):
                        cell = table.cell(row_index, column_index)
                        cell.text = value
                        for paragraph in cell.paragraphs:
                            for run in paragraph.runs:
                                run.font.size = Pt(10)
            continue

        if stripped in ('---', '***', '___'):
            document.add_paragraph('')
            index += 1
            continue

        if stripped.startswith('#'):
            level = len(stripped) - len(stripped.lstrip('#'))
            title = stripped[level:].strip()
            if title:
                document.add_heading(title, level=max(1, min(6, level)))
            index += 1
            continue

        bullet = None
        if stripped[:2] in ('- ', '* ', '+ '):
            bullet = 'List Bullet'
            content = stripped[2:].strip()
        else:
            for marker in range(1, 5):
                prefix = str(marker) + '. '
                if stripped.startswith(prefix):
                    bullet = 'List Number'
                    content = stripped[len(prefix):].strip()
                    break
        if bullet:
            paragraph = document.add_paragraph(style=bullet)
            paragraph.add_run(content)
            index += 1
            continue

        if stripped.startswith('> '):
            document.add_paragraph(stripped[2:], style='Quote')
        else:
            document.add_paragraph(stripped)
        index += 1

    if code_lines:
        for code_line in code_lines:
            document.add_paragraph(code_line)
    document.save(path)
    return len(document.paragraphs), len(document.tables)


def main():
    if len(sys.argv) < 3:
        emit({'ok': False, 'error': 'usage: docx_tool.py read|write <path>'})
        return
    action, path = sys.argv[1], sys.argv[2]
    try:
        if action == 'read':
            emit({'ok': True, 'text': read_document(path)})
        elif action == 'write':
            payload = json.loads(sys.stdin.buffer.read().decode('utf-8') or '{}')
            paragraphs, tables = write_document(path, str(payload.get('text', '')))
            emit({'ok': True, 'paragraphs': paragraphs, 'tables': tables})
        else:
            emit({'ok': False, 'error': 'unknown action: ' + action})
    except Exception as error:  # surfaced to the host as a tool error
        emit({'ok': False, 'error': type(error).__name__ + ': ' + str(error)})


if __name__ == '__main__':
    main()
