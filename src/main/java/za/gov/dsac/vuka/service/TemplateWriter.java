package za.gov.dsac.vuka.service;

import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import za.gov.dsac.vuka.domain.PublicEntity;
import za.gov.dsac.vuka.domain.ReportingPeriod;
import za.gov.dsac.vuka.domain.Target;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.util.List;

/**
 * Writes the pre filled quarterly reporting template.
 *
 * <h2>Why pre filled</h2>
 *
 * UC-1, and the failure it prevents is specific. Hand a reporter a blank template and they retype
 * nineteen indicator names from their Annual Performance Plan. One of them comes out slightly
 * wrong, the parser cannot match that row, and the target silently goes unreported. Shipping the
 * indicator codes and the annual targets already in the file removes that whole class of defect
 * for the price of one POI writer, and it is the cheapest defect prevention in the product.
 *
 * <h2>The contract with the parser</h2>
 *
 * The sheet name, the header row and the column headers here must match {@link TemplateParser}
 * exactly, so they are read from it rather than repeated as literals. The parser is the standard
 * and this class is a producer of it, not a second definition. A hidden Schema sheet carries the
 * version, so a file completed against an older template can be recognised rather than guessed at.
 *
 * <h2>What the actuals column is not</h2>
 *
 * Empty. The template never pre fills a figure, not even last quarter's, because a reporter who
 * finds a number already in the box will leave it there. The annual target and the quarterly
 * target are shown as read only context in their own columns.
 */
@Service
public class TemplateWriter {

    /** Bumped when the column set changes, and written into the hidden Schema sheet. */
    public static final String SCHEMA_VERSION = "vuka-quarterly-1";

    /**
     * Columns, in the order the file presents them.
     *
     * <p>The first four are context the entity should not have to retype and must not change. The
     * rest are what the reporter fills in, and every one of them is a column the parser reads.
     */
    private static final String[] HEADERS = {
            "Indicator Ref",            // parsed: the match key
            "Indicator",                // context, not parsed
            "Unit of Measure",          // context, not parsed
            "Annual Target",            // context, not parsed
            "Quarter Target",           // context, not parsed
            "Actual Delivered",         // parsed
            "Variance",                 // parsed
            "Status",                   // parsed
            "Variance Explanation",     // parsed
            "Spend to Date (R)",        // parsed
            "Evidence Reference",       // parsed
    };

    public byte[] build(PublicEntity entity, ReportingPeriod period, List<Target> targets)
            throws Exception {

        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {

            Sheet sheet = wb.createSheet(TemplateParser.SHEET_NAME);

            CellStyle title = bold(wb, 14);
            CellStyle label = bold(wb, 11);
            CellStyle header = headerStyle(wb);
            CellStyle locked = lockedStyle(wb);
            CellStyle entry = entryStyle(wb);

            /* Rows 0 to 8: who this file is for and what it is for. The parser starts at the
               header on row 9, so everything above it is free for humans. */
            put(sheet, 0, 0, "DSAC quarterly performance report", title);
            put(sheet, 1, 0, "Entity", label);
            put(sheet, 1, 1, entity.getName(), null);
            put(sheet, 2, 0, "Period", label);
            put(sheet, 2, 1, period.getLabel(), null);
            put(sheet, 3, 0, "Window", label);
            put(sheet, 3, 1, period.getPeriodStart() + " to " + period.getPeriodEnd(), null);
            put(sheet, 4, 0, "Due", label);
            put(sheet, 4, 1, String.valueOf(period.getSubmissionDueDate()), null);
            put(sheet, 5, 0, "Basis", label);
            put(sheet, 5, 1, period.getDeadlineCitation() == null
                    ? String.valueOf(period.getDeadlineBasis())
                    : period.getDeadlineCitation(), null);

            put(sheet, 7, 0,
                    "Fill in the Actual Delivered column only. The first five columns carry your "
                    + "registered targets and must not be changed: they are what this file is "
                    + "matched on when you upload it.", null);
            put(sheet, 8, 0,
                    "Nothing in this file becomes a reported result until you confirm each figure "
                    + "in Vuka, in your own name.", null);

            Row headerRow = sheet.createRow(TemplateParser.HEADER_ROW);
            for (int c = 0; c < HEADERS.length; c++) {
                Cell cell = headerRow.createCell(c);
                cell.setCellValue(HEADERS[c]);
                cell.setCellStyle(header);
            }

            int r = TemplateParser.FIRST_DATA_ROW;
            for (Target t : targets) {
                Row row = sheet.createRow(r++);

                text(row, 0, t.getIndicatorRef(), locked);
                text(row, 1, t.getIndicator(), locked);
                text(row, 2, t.getUnitOfMeasure(), locked);
                number(row, 3, t.getAnnualTarget(), locked);
                number(row, 4, ReportingViewService.quarterTarget(t, period.getQuarter()), locked);

                // Actual Delivered and everything after it: empty, and styled so it is obvious
                // which columns the reporter owns.
                for (int c = 5; c < HEADERS.length; c++) {
                    row.createCell(c).setCellStyle(entry);
                }
            }

            for (int c = 0; c < HEADERS.length; c++) sheet.autoSizeColumn(c);
            // autoSizeColumn on a long indicator description produces a column nobody can scroll
            // past, so the two narrative columns are capped.
            sheet.setColumnWidth(1, Math.min(sheet.getColumnWidth(1), 16000));
            sheet.setColumnWidth(8, 12000);
            sheet.createFreezePane(0, TemplateParser.FIRST_DATA_ROW);

            /* The hidden Schema sheet. A file completed against an older template can then be
               recognised rather than guessed at from its column headers. */
            Sheet schema = wb.createSheet("Schema");
            put(schema, 0, 0, "schemaVersion", null);
            put(schema, 0, 1, SCHEMA_VERSION, null);
            put(schema, 1, 0, "sheetName", null);
            put(schema, 1, 1, TemplateParser.SHEET_NAME, null);
            put(schema, 2, 0, "headerRow", null);
            put(schema, 2, 1, String.valueOf(TemplateParser.HEADER_ROW + 1), null);
            put(schema, 3, 0, "entityId", null);
            put(schema, 3, 1, String.valueOf(entity.getId()), null);
            put(schema, 4, 0, "periodId", null);
            put(schema, 4, 1, String.valueOf(period.getId()), null);
            wb.setSheetHidden(wb.getSheetIndex(schema), true);

            wb.write(out);
            return out.toByteArray();
        }
    }

    /** Iziko_Q2-2026-27_template.xlsx, with nothing in it a Content-Disposition header dislikes. */
    public String fileName(PublicEntity entity, ReportingPeriod period) {
        String who = entity.getShortName() == null ? "entity" : entity.getShortName();
        String when = period.getLabel() == null ? "period" : period.getLabel();
        return (who + "_" + when + "_template.xlsx").replaceAll("[^A-Za-z0-9._-]", "-");
    }

    /* ---------- styling, kept deliberately plain ---------- */

    private static CellStyle bold(Workbook wb, int points) {
        Font f = wb.createFont();
        f.setBold(true);
        f.setFontHeightInPoints((short) points);
        CellStyle s = wb.createCellStyle();
        s.setFont(f);
        return s;
    }

    private static CellStyle headerStyle(Workbook wb) {
        CellStyle s = bold(wb, 11);
        s.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
        s.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        s.setBorderBottom(BorderStyle.THIN);
        s.setWrapText(true);
        return s;
    }

    /** The columns that carry registered targets. Greyed, so changing one looks wrong. */
    private static CellStyle lockedStyle(Workbook wb) {
        CellStyle s = wb.createCellStyle();
        s.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
        s.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        s.setVerticalAlignment(VerticalAlignment.TOP);
        s.setWrapText(true);
        return s;
    }

    /** The columns the reporter fills in. Bordered and empty. */
    private static CellStyle entryStyle(Workbook wb) {
        CellStyle s = wb.createCellStyle();
        s.setBorderBottom(BorderStyle.HAIR);
        s.setBorderLeft(BorderStyle.HAIR);
        s.setBorderRight(BorderStyle.HAIR);
        s.setVerticalAlignment(VerticalAlignment.TOP);
        return s;
    }

    private static void put(Sheet sheet, int r, int c, String value, CellStyle style) {
        Row row = sheet.getRow(r);
        if (row == null) row = sheet.createRow(r);
        Cell cell = row.createCell(c);
        cell.setCellValue(value == null ? "" : value);
        if (style != null) cell.setCellStyle(style);
    }

    private static void text(Row row, int c, String value, CellStyle style) {
        Cell cell = row.createCell(c);
        cell.setCellValue(value == null ? "" : value);
        cell.setCellStyle(style);
    }

    /**
     * A number, or a blank cell where there is no figure.
     *
     * <p>Never a zero. An unset quarterly target written as 0 tells the reporter their target for
     * the quarter is nothing, which is a false statement about what they agreed to deliver.
     */
    private static void number(Row row, int c, BigDecimal value, CellStyle style) {
        Cell cell = row.createCell(c);
        if (value != null) cell.setCellValue(value.doubleValue());
        cell.setCellStyle(style);
    }
}
