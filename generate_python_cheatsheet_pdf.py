from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import ListFlowable, ListItem, Paragraph, Preformatted, SimpleDocTemplate, Spacer


PROJECT_DIR = Path(__file__).resolve().parent
SOURCE_MD = PROJECT_DIR / "python-cheat-sheet.md"
OUTPUT_PDF = Path.home() / "Downloads" / "python-python-beginner-cheat-sheet.pdf"


def build_styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="CheatTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=24,
            leading=30,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#17324d"),
            spaceAfter=18,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CheatSubtitle",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=11,
            leading=15,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#4d6278"),
            spaceAfter=18,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SectionHeading",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=19,
            textColor=colors.HexColor("#17324d"),
            spaceBefore=10,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BodyCopy",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BulletCopy",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            leftIndent=12,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CodeBlock",
            parent=styles["Code"],
            fontName="Courier",
            fontSize=8.5,
            leading=11,
            leftIndent=10,
            rightIndent=10,
            borderPadding=8,
            backColor=colors.HexColor("#f4f7fb"),
            borderColor=colors.HexColor("#d5deea"),
            borderWidth=0.6,
            borderRadius=3,
            spaceBefore=4,
            spaceAfter=8,
        )
    )
    return styles


def flush_bullets(story, bullets, styles):
    if not bullets:
        return
    items = [
        ListItem(Paragraph(bullet, styles["BulletCopy"]), leftIndent=0)
        for bullet in bullets
    ]
    story.append(
        ListFlowable(
            items,
            bulletType="bullet",
            start="circle",
            leftIndent=18,
            bulletFontName="Helvetica",
            bulletFontSize=8,
        )
    )
    story.append(Spacer(1, 0.06 * inch))
    bullets.clear()


def flush_code(story, code_lines, styles):
    if not code_lines:
        return
    story.append(Preformatted("\n".join(code_lines), styles["CodeBlock"]))
    code_lines.clear()


def build_story(markdown_text):
    styles = build_styles()
    story = [
        Paragraph("Python Cheat Sheet for Beginners", styles["CheatTitle"]),
        Paragraph(
            "Beginner-friendly study notes based on your first PY101 lessons.",
            styles["CheatSubtitle"],
        ),
    ]

    in_code = False
    code_lines = []
    bullets = []

    for raw_line in markdown_text.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()

        if stripped.startswith("```"):
            if in_code:
                flush_code(story, code_lines, styles)
                in_code = False
            else:
                flush_bullets(story, bullets, styles)
                in_code = True
            continue

        if in_code:
            code_lines.append(line)
            continue

        if stripped == "---":
            flush_bullets(story, bullets, styles)
            story.append(Spacer(1, 0.14 * inch))
            continue

        if not stripped:
            flush_bullets(story, bullets, styles)
            story.append(Spacer(1, 0.04 * inch))
            continue

        if stripped.startswith("# "):
            continue

        if stripped.startswith("## "):
            flush_bullets(story, bullets, styles)
            story.append(Paragraph(stripped[3:], styles["SectionHeading"]))
            continue

        if stripped.startswith("- "):
            bullets.append(stripped[2:])
            continue

        if stripped.startswith(("1. ", "2. ", "3. ", "4. ", "5. ", "6. ", "7. ", "8. ", "9. ")):
            flush_bullets(story, bullets, styles)
            story.append(Paragraph(stripped, styles["BodyCopy"]))
            continue

        flush_bullets(story, bullets, styles)
        story.append(Paragraph(stripped, styles["BodyCopy"]))

    flush_bullets(story, bullets, styles)
    flush_code(story, code_lines, styles)
    return story


def main():
    markdown_text = SOURCE_MD.read_text(encoding="utf-8")
    OUTPUT_PDF.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(OUTPUT_PDF),
        pagesize=letter,
        rightMargin=0.65 * inch,
        leftMargin=0.65 * inch,
        topMargin=0.7 * inch,
        bottomMargin=0.7 * inch,
        title="Python Beginner Cheat Sheet",
        author="OpenAI Codex",
    )
    doc.build(build_story(markdown_text))
    print(OUTPUT_PDF)


if __name__ == "__main__":
    main()
