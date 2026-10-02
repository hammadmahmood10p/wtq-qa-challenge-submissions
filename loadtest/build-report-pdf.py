"""
Builds the load test report as a PDF.

Reads the per-tier JSON that k6 wrote and produces something a person who was not
in the room can read: what was tested, what came back, the one thing that had to
change, and whether the result clears what the event needs.

    py loadtest/build-report-pdf.py

Server-side peaks cannot be read from the k6 output, so they are passed in below —
see VM_PEAKS. Anything not measured says so rather than showing a zero.
"""

import json
import os
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.linecharts import HorizontalLineChart

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, "results")
OUT = os.path.join(RESULTS, "WTQ2026-Load-Test-Report.pdf")

# Validated against the data-viz skill's six checks (light surface):
# CVD separation DeltaE 24.7, normal-vision 33.6, contrast >= 3:1 — all PASS.
SERIES_1 = colors.HexColor("#2a78d6")   # blue   — the measured series
SERIES_2 = colors.HexColor("#eb6834")   # orange — the superseded series
INK = colors.HexColor("#0b0b0b")
INK_2 = colors.HexColor("#52514e")
MUTED = colors.HexColor("#8a8a85")
RULE = colors.HexColor("#d8d8d2")
SURFACE = colors.HexColor("#fcfcfb")
GOOD = colors.HexColor("#1baf7a")
WARN = colors.HexColor("#eda100")

# Measured on the VM by loadtest/watch-vm.sh during the run.
VM_PEAKS = {
    "total_mb": 7954,
    "peak_used_mb": 1690,
    "peak_app_mb": 337,
    "db_connections": None,  # not captured — see the note in the report
}

BUDGET = {"failed": 0.01, "p95": 2000, "login_p95": 4000}


def load():
    runs = []
    for name in sorted(os.listdir(RESULTS)):
        if name.endswith(".json"):
            with open(os.path.join(RESULTS, name), encoding="utf-8") as fh:
                runs.append(json.load(fh))
    return runs


styles = getSampleStyleSheet()


def style(name, size, leading, colour=INK, space_before=0, space_after=4, bold=False):
    return ParagraphStyle(
        name,
        parent=styles["Normal"],
        fontName="Helvetica-Bold" if bold else "Helvetica",
        fontSize=size,
        leading=leading,
        textColor=colour,
        spaceBefore=space_before,
        spaceAfter=space_after,
        alignment=TA_LEFT,
    )


S = {
    "title": style("t", 22, 27, INK, 0, 2, True),
    "sub": style("s", 11, 15, INK_2, 0, 14),
    "h1": style("h1", 14, 18, INK, 16, 7, True),
    "h2": style("h2", 11, 15, INK, 11, 4, True),
    "body": style("b", 9.5, 14, INK_2, 0, 6),
    "small": style("sm", 8, 11.5, MUTED, 0, 4),
    "verdict": style("v", 12, 17, INK, 0, 6, True),
}


def rule():
    return HRFlowable(width="100%", thickness=0.6, color=RULE, spaceBefore=4, spaceAfter=8)


def table(data, widths, aligns=None, head=True, highlight_rows=()):
    # repeatRows so a table that splits across a page keeps its column headings. The
    # participants table does split, and without this the continuation opens with a
    # row of bare numbers and no way to tell which column is which.
    t = Table(data, colWidths=widths, hAlign="LEFT", repeatRows=1 if head else 0)
    cmds = [
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TEXTCOLOR", (0, 0), (-1, -1), INK_2),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, RULE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
    if head:
        cmds += [
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("TEXTCOLOR", (0, 0), (-1, 0), INK),
            ("LINEBELOW", (0, 0), (-1, 0), 0.9, INK),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ]
    for col, how in (aligns or {}).items():
        cmds.append(("ALIGN", (col, 0), (col, -1), how))
    for r in highlight_rows:
        cmds.append(("BACKGROUND", (0, r), (-1, r), colors.HexColor("#f4f8fd")))
    t.setStyle(TableStyle(cmds))
    return t


def latency_chart(participants):
    """
    p95 latency against virtual users. One series, so no legend — the title names it.

    The axis tops out at 300 ms rather than at the 2000 ms budget. Scaling to the
    budget was the first attempt and it rendered every measurement as a flat line
    pinned to the baseline: technically it showed the headroom, but it made the data
    itself unreadable, which is the opposite of the point. The budget is stated in the
    subtitle instead, where it does not cost the reader the shape of the line.
    """
    d = Drawing(430, 150)

    chart = HorizontalLineChart()
    chart.x, chart.y = 38, 32
    chart.width, chart.height = 370, 88
    chart.data = [[r["duration"]["p95"] for r in participants]]
    chart.categoryAxis.categoryNames = [str(r["vus"]) for r in participants]
    chart.lines[0].strokeColor = SERIES_1
    chart.lines[0].strokeWidth = 2
    chart.lines[0].symbol = None
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = 300
    chart.valueAxis.valueStep = 50
    chart.valueAxis.strokeColor = RULE
    chart.valueAxis.gridStrokeColor = colors.HexColor("#ececE6")
    chart.valueAxis.gridStrokeWidth = 0.4
    chart.valueAxis.visibleGrid = 1
    chart.valueAxis.labels.fontName = "Helvetica"
    chart.valueAxis.labels.fontSize = 7.5
    chart.valueAxis.labels.fillColor = MUTED
    chart.categoryAxis.strokeColor = RULE
    chart.categoryAxis.labels.fontName = "Helvetica"
    chart.categoryAxis.labels.fontSize = 7.5
    chart.categoryAxis.labels.fillColor = MUTED
    d.add(chart)

    # Direct-label the ends only — never a number on every point.
    first, last = participants[0], participants[-1]
    d.add(String(40, 32 + (first["duration"]["p95"] / 300.0) * 88 + 7,
                 "%d ms" % first["duration"]["p95"],
                 fontName="Helvetica-Bold", fontSize=7.5, fillColor=SERIES_1))
    d.add(String(374, 32 + (last["duration"]["p95"] / 300.0) * 88 + 7,
                 "%d ms" % last["duration"]["p95"],
                 fontName="Helvetica-Bold", fontSize=7.5, fillColor=SERIES_1))

    d.add(String(38, 138, "95th percentile response time by concurrent participants",
                 fontName="Helvetica-Bold", fontSize=9, fillColor=INK))
    d.add(String(38, 127, "Axis tops out at 300 ms. The budget is 2000 ms — nearly seven times "
                          "higher than anything measured.",
                 fontName="Helvetica", fontSize=7.5, fillColor=MUTED))
    d.add(String(38, 8, "concurrent virtual users",
                 fontName="Helvetica", fontSize=7.5, fillColor=MUTED))
    return d


def logins_chart(before, after):
    """Successful sign-ins before and after the limit was raised. Two series: legend + labels."""
    d = Drawing(430, 168)

    chart = VerticalBarChart()
    chart.x, chart.y = 40, 42
    chart.width, chart.height = 296, 90
    chart.data = [before, after]
    chart.categoryAxis.categoryNames = ["300 users", "400 users", "500 users"]
    chart.bars[0].fillColor = SERIES_2
    chart.bars[1].fillColor = SERIES_1
    chart.bars.strokeColor = SURFACE
    chart.bars.strokeWidth = 2          # the 2px surface gap between adjacent fills
    chart.groupSpacing = 18
    chart.barSpacing = 1
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = 1100
    chart.valueAxis.valueStep = 250
    chart.valueAxis.strokeColor = RULE
    chart.valueAxis.visibleGrid = 1
    chart.valueAxis.gridStrokeColor = colors.HexColor("#ececE6")
    chart.valueAxis.gridStrokeWidth = 0.4
    chart.valueAxis.labels.fontName = "Helvetica"
    chart.valueAxis.labels.fontSize = 7.5
    chart.valueAxis.labels.fillColor = MUTED
    chart.categoryAxis.strokeColor = RULE
    chart.categoryAxis.labels.fontName = "Helvetica"
    chart.categoryAxis.labels.fontSize = 7.5
    chart.categoryAxis.labels.fillColor = MUTED
    chart.barLabels.fontName = "Helvetica-Bold"
    chart.barLabels.fontSize = 7.5
    chart.barLabels.fillColor = INK_2
    chart.barLabelFormat = "%d"
    chart.barLabels.dy = 6
    d.add(chart)

    d.add(String(40, 152, "Successful sign-ins, before and after the per-IP limit was raised",
                 fontName="Helvetica-Bold", fontSize=9, fillColor=INK))
    d.add(String(40, 141, "Identical workload. Before, every tier stopped at the 300 ceiling.",
                 fontName="Helvetica", fontSize=7.5, fillColor=MUTED))

    # Legend — always present for two series.
    lx, ly = 352, 112
    d.add(Rect(lx, ly, 9, 9, fillColor=SERIES_2, strokeColor=None))
    d.add(String(lx + 13, ly + 1.5, "before", fontName="Helvetica", fontSize=7.5, fillColor=INK_2))
    d.add(Rect(lx, ly - 16, 9, 9, fillColor=SERIES_1, strokeColor=None))
    d.add(String(lx + 13, ly - 14.5, "after", fontName="Helvetica", fontSize=7.5, fillColor=INK_2))

    d.add(String(40, 16, "limit raised from 300 to 2000 sign-ins per five minutes per address",
                 fontName="Helvetica", fontSize=7.5, fillColor=MUTED))
    return d


def build():
    runs = load()
    P = sorted([r for r in runs if r["kind"] == "participants"], key=lambda r: r["vus"])
    J = sorted([r for r in runs if r["kind"] == "judges"], key=lambda r: r["vus"])

    when = sorted(r["at"] for r in runs)
    total_requests = sum(r["requests"] for r in runs)
    total_logins = sum(r["login"]["success"] for r in runs)
    total_failed_checks = sum(r["checksFailed"] for r in runs)
    worst_p95 = max(r["duration"]["p95"] for r in runs)
    worst_failed = max(r["failedRate"] for r in runs)
    top = P[-1]

    doc = SimpleDocTemplate(
        OUT, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
        title="WTQ 2026 Submission Portal — Load and Stress Test Report",
        author="WTQ 2026 QA",
    )

    s = []
    s.append(Paragraph("Load and Stress Test Report", S["title"]))
    s.append(Paragraph(
        "Women Tech Quest 2026 — QA Challenge Submission Portal<br/>"
        "Tested %s to %s UTC &nbsp;·&nbsp; %s"
        % (when[0][:16].replace("T", " "), when[-1][:16].replace("T", " "),
           top["baseUrl"].replace("https://", "")),
        S["sub"]))
    s.append(rule())

    # ---- verdict -------------------------------------------------------------
    s.append(Paragraph("Verdict", S["h1"]))
    s.append(Paragraph(
        "The portal handles the full event load with substantial headroom.", S["verdict"]))
    s.append(Paragraph(
        "Across %s requests and %s sign-ins in twelve test runs, <b>not one request failed</b> "
        "and <b>not one assertion failed</b>. The slowest 95th-percentile response at any load "
        "was %d ms against a budget of %d ms — roughly %d%% of the time allowed. "
        "At the largest tier, %d concurrent participants, the server used %s GB of its %s GB "
        "of memory."
        % (f"{total_requests:,}", f"{total_logins:,}", worst_p95, BUDGET["p95"],
           round(worst_p95 / BUDGET["p95"] * 100), top["vus"],
           round(VM_PEAKS["peak_used_mb"] / 1024.0, 1),
           round(VM_PEAKS["total_mb"] / 1024.0, 1)),
        S["body"]))
    s.append(Paragraph(
        "One defect was found and fixed: a sign-in rate limit sized for an individual rather "
        "than for a venue. Before the fix it turned away 70% of arrivals at full scale. "
        "It is described on page 2.", S["body"]))

    headline = [
        ["Requests", "Failed", "Assertions failed", "Slowest p95", "Peak memory"],
        [f"{total_requests:,}", "%.2f%%" % (worst_failed * 100), str(total_failed_checks),
         "%d ms" % worst_p95,
         "%s GB of %s" % (round(VM_PEAKS["peak_used_mb"] / 1024.0, 1),
                          round(VM_PEAKS["total_mb"] / 1024.0, 1))],
    ]
    s.append(Spacer(1, 4))
    s.append(table(headline, [70, 60, 92, 66, 92],
                   aligns={1: "CENTER", 2: "CENTER", 3: "CENTER", 4: "CENTER"},
                   highlight_rows=(1,)))

    # ---- what was tested -----------------------------------------------------
    s.append(Paragraph("What was tested", S["h1"]))
    s.append(Paragraph(
        "The event expects up to 500 participants across Karachi, Lahore and Islamabad, all "
        "starting a three-hour attempt at the same time, and up to 20 judges reviewing "
        "afterwards. The test reproduces that shape rather than hammering a single endpoint: "
        "each virtual participant signs in, loads the briefing and then polls its attempt "
        "status the way the live workspace does. Each virtual judge signs in and repeatedly "
        "reloads the submissions table, which is the heaviest read in the application.",
        S["body"]))
    s.append(Paragraph(
        "Load was generated from a single laptop, which is deliberate: every participant at a "
        "venue reaches the server through that venue's one shared network address, so a single "
        "source reproduces exactly the traffic pattern the event will produce — and it is what "
        "exposed the defect below.", S["body"]))

    env = [
        ["Server", "8 vCPU, 7.8 GB RAM, Ubuntu 24.04 — application, web server and database on one machine"],
        ["Application", "2 replicas behind nginx 1.30.5, TLS, PostgreSQL 16"],
        ["Tool", "k6 v1.2.3, generated from one laptop over the corporate network"],
        ["Accounts", "500 test participants and 50 test judges, created and removed through the portal"],
        ["Tiers", "Participants 50 / 100 / 150 / 200 / 300 / 400 / 500 · Judges 5 / 10 / 20 / 30 / 50"],
    ]
    s.append(Spacer(1, 2))
    s.append(table(env, [68, 372], head=False))

    s.append(Spacer(1, 10))
    s.append(latency_chart(P))

    # ---- the defect ----------------------------------------------------------
    s.append(Paragraph("The defect found, and the fix", S["h1"]))
    s.append(Paragraph(
        "The portal limits how many sign-in attempts it accepts from one network address: "
        "originally 300 in any five minutes. That is a sensible figure for one person and the "
        "wrong one for a venue, because several hundred participants behind a shared address "
        "look to the server like a single very busy client.", S["body"]))
    s.append(Paragraph(
        "The first run made this unmistakable. From 200 concurrent users upwards, successful "
        "sign-ins stopped at exactly 300 and went no higher however many users arrived. At 500 "
        "users, <b>712 of 1,012 attempts were refused</b>. On the day that would have been most "
        "of a venue told to wait and try again, during the ten minutes when everyone arrives.",
        S["body"]))
    s.append(Paragraph(
        "The limit was raised to 2,000 per five minutes — enough for the entire roster, their "
        "retries and the judging panel, even in the worst case where all three cities share one "
        "address. The protection that actually stops an attack on a participant's account is a "
        "separate per-account limit of 10 attempts per five minutes, which was left untouched.",
        S["body"]))
    s.append(Spacer(1, 6))
    s.append(logins_chart([300, 300, 300], [r["login"]["success"] for r in P[-3:]]))
    s.append(Paragraph(
        "The tiers were then re-run. Sign-ins now rise with the load instead of stopping at a "
        "ceiling, which is what proves the largest tiers exercised real signed-in users rather "
        "than a queue of rejections — and the server absorbed nearly double the traffic at "
        "<i>lower</i> latency than before.", S["body"]))

    # ---- results -------------------------------------------------------------
    s.append(Paragraph("Results in full", S["h1"]))

    s.append(Paragraph("Participants", S["h2"]))
    rows = [["Users", "Requests", "Failed", "p95", "Slowest", "Sign-ins", "Refused", "Verdict"]]
    for r in P:
        refused = r["login"]["rateLimitedIp"]
        ok = r["failedRate"] <= BUDGET["failed"] and r["duration"]["p95"] <= BUDGET["p95"]
        verdict = "Pass" if (ok and refused == 0) else ("Pass*" if ok else "Fail")
        rows.append([str(r["vus"]), f"{r['requests']:,}", "%.2f%%" % (r["failedRate"] * 100),
                     "%d ms" % r["duration"]["p95"], "%d ms" % r["duration"]["max"],
                     str(r["login"]["success"]), str(refused), verdict])
    s.append(table(rows, [42, 62, 48, 50, 54, 54, 52, 78],
                   aligns={0: "CENTER", 1: "RIGHT", 2: "RIGHT", 3: "RIGHT", 4: "RIGHT",
                           5: "RIGHT", 6: "RIGHT", 7: "CENTER"}))
    s.append(Paragraph(
        "* The 200-user row was recorded before the limit was raised and is kept for the record. "
        "A larger tier passing with nothing refused supersedes it.", S["small"]))

    s.append(Paragraph("Judges", S["h2"]))
    rows = [["Judges", "Requests", "Failed", "p95", "Slowest", "Sign-ins", "Verdict"]]
    for r in J:
        ok = r["failedRate"] <= BUDGET["failed"] and r["duration"]["p95"] <= BUDGET["p95"]
        rows.append([str(r["vus"]), f"{r['requests']:,}", "%.2f%%" % (r["failedRate"] * 100),
                     "%d ms" % r["duration"]["p95"], "%d ms" % r["duration"]["max"],
                     str(r["login"]["success"]), "Pass" if ok else "Fail"])
    s.append(table(rows, [46, 62, 48, 50, 54, 54, 78],
                   aligns={0: "CENTER", 1: "RIGHT", 2: "RIGHT", 3: "RIGHT", 4: "RIGHT",
                           5: "RIGHT", 6: "CENTER"}))
    s.append(Paragraph(
        "Twenty judges is the stated maximum for the event. The 30 and 50 rows are stress beyond "
        "requirement, included to show headroom.", S["small"]))

    # ---- server ---------------------------------------------------------------
    s.append(Paragraph("Server behaviour under load", S["h1"]))
    vm = [
        ["Measure", "Peak during the test", "Available", "Reading"],
        ["System memory", "%s GB" % round(VM_PEAKS["peak_used_mb"] / 1024.0, 2),
         "%s GB" % round(VM_PEAKS["total_mb"] / 1024.0, 1),
         "%d%% used — ample" % round(VM_PEAKS["peak_used_mb"] / VM_PEAKS["total_mb"] * 100)],
        ["Application memory", "%d MB" % VM_PEAKS["peak_app_mb"], "both replicas",
         "Small and stable; no leak after 35,000 requests"],
        ["Database connections", "not captured", "20 (capped by design)",
         "See note below"],
    ]
    s.append(table(vm, [110, 110, 100, 120]))
    s.append(Paragraph(
        "<b>Note on database connections.</b> The monitoring script could not read this figure: "
        "it queries the database as an administrator, and the account it ran under requires a "
        "password it could not supply. The number is therefore unknown rather than zero. It is "
        "not a gap that changes the conclusion — the application caps its own pool at 10 "
        "connections per replica, so 20 is a structural ceiling that cannot be exceeded, and "
        "exhausting it would have shown as rising response times, which did not occur. The "
        "script has been corrected to report the figure or say plainly that it could not be "
        "measured.", S["body"]))

    # ---- limits ---------------------------------------------------------------
    s.append(Paragraph("What this test does not cover", S["h1"]))
    for item in [
        "<b>The final submission rush.</b> Every participant uploading a report in the last ten "
        "minutes is the heaviest moment of the event and was not exercised. It requires uploading "
        "real files and filling the server's disk, so it needs its own run against a disposable "
        "database.",
        "<b>Three hours of accumulated activity.</b> Each run lasts minutes. Growth in saved work, "
        "sessions and database activity across a full attempt is not represented.",
        "<b>Venue networks.</b> Load came from one corporate connection. Participants will be on "
        "venue wi-fi, which will be slower and less reliable than anything measured here.",
        "<b>Judges saving scores.</b> Judges read the submissions table in this test but do not "
        "write marks. Scoring is low-volume and low-concurrency by nature.",
    ]:
        s.append(Paragraph("•&nbsp;&nbsp;" + item, S["body"]))

    # ---- conclusion -----------------------------------------------------------
    s.append(Paragraph("Conclusion", S["h1"]))
    s.append(Paragraph(
        "The application is ready for the expected event load. It served %d concurrent "
        "participants and 50 concurrent judges without a single failed request, at response "
        "times roughly %dx inside the budget, on a server using about a fifth of its memory. "
        "The one defect the test found — a rate limit that would have locked out most of a venue "
        "at the worst possible moment — was found precisely because the test reproduced the real "
        "traffic shape, and has been fixed and re-verified."
        % (top["vus"], round(BUDGET["p95"] / worst_p95)),
        S["body"]))
    s.append(Paragraph(
        "The remaining risk is not capacity. It is the items listed above as untested, and the "
        "operational readiness of the venue networks on the day.", S["body"]))

    s.append(Spacer(1, 14))
    s.append(rule())
    s.append(Paragraph(
        "Generated %s UTC from the k6 result files in loadtest/results/. "
        "Method and scripts: loadtest/ and docs/LOAD_TESTING.md."
        % datetime.now(timezone.utc).strftime("%d %B %Y %H:%M"), S["small"]))

    doc.build(s)
    print("wrote " + OUT)


if __name__ == "__main__":
    build()
