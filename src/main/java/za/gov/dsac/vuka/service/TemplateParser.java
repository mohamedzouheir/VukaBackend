package za.gov.dsac.vuka.service;

import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellReference;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Reads the DSAC quarterly reporting template.
 *
 * <h2>Why a template rather than free-form documents</h2>
 *
 * Parsing an arbitrary Annual Performance Plan is a research project. Parsing a
 * defined template is ordinary engineering that works every time. The template is
 * also the product insight: what government is missing is not a portal, it is a
 * machine-readable standard for the performance information entities already
 * compile. This class is that standard, enforced.
 *
 * <h2>What it never does</h2>
 *
 * It does not write a {@code TargetResult}. Every value it reads becomes an
 * {@code ExtractionResult} carrying the cell it came from, and stays unconfirmed
 * until a named human accepts it. Rows it cannot match to a registered target are
 * flagged for manual matching, never silently dropped.
 */
@Service
public class TemplateParser {

    /** Matches the template's Schema sheet: header on row 10, data from row 11. */
    public static final String SHEET_NAME = "Quarterly Report";
    public static final int HEADER_ROW = 9;   // zero-based
    public static final int FIRST_DATA_ROW = 10;

    /** Column headers the parser requires, mapped to the field each becomes. */
    private static final Map<String, String> FIELD_BY_HEADER = new LinkedHashMap<>() {{
        put("Indicator Ref",         "indicatorRef");
        put("Actual Delivered",      "actualValue");
        put("Variance",              "variance");
        put("Status",                "status");
        put("Variance Explanation",  "varianceExplanation");
        put("Spend to Date (R)",     "spendToDate");
        put("Evidence Reference",    "evidenceReference");
    }};

    /** One parsed row, before any matching against registered targets. */
    public record ParsedCell(String fieldName, String value, String sourceLocation, BigDecimal confidence) {}

    public record ParsedRow(String indicatorRef, int rowNumber, List<ParsedCell> cells) {}

    public record ParseOutcome(List<ParsedRow> rows, List<String> warnings) {}

    /**
     * Parses an uploaded workbook.
     *
     * @param in the uploaded .xlsx stream
     * @return every value read, with the cell reference it came from
     */
    public ParseOutcome parse(InputStream in) throws Exception {
        List<ParsedRow> rows = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        try (Workbook wb = new XSSFWorkbook(in)) {
            Sheet sheet = wb.getSheet(SHEET_NAME);
            if (sheet == null) {
                warnings.add("No sheet named '" + SHEET_NAME + "'. "
                        + "The file does not look like the DSAC reporting template.");
                return new ParseOutcome(rows, warnings);
            }

            Map<String, Integer> columnByHeader = readHeader(sheet, warnings);
            if (!columnByHeader.containsKey("Indicator Ref")) {
                warnings.add("No 'Indicator Ref' column found. Cannot match rows to targets.");
                return new ParseOutcome(rows, warnings);
            }

            DataFormatter formatter = new DataFormatter();
            FormulaEvaluator evaluator = wb.getCreationHelper().createFormulaEvaluator();

            for (int r = FIRST_DATA_ROW; r <= sheet.getLastRowNum(); r++) {
                Row row = sheet.getRow(r);
                if (row == null) continue;

                String ref = readString(row, columnByHeader.get("Indicator Ref"), formatter, evaluator);
                if (ref == null || ref.isBlank()) continue;   // blank row, not an error

                List<ParsedCell> cells = new ArrayList<>();
                for (Map.Entry<String, String> e : FIELD_BY_HEADER.entrySet()) {
                    Integer col = columnByHeader.get(e.getKey());
                    if (col == null) continue;

                    Cell cell = row.getCell(col);
                    String value = readString(row, col, formatter, evaluator);
                    if (value == null || value.isBlank()) continue;

                    cells.add(new ParsedCell(
                            e.getValue(),
                            value.trim(),
                            SHEET_NAME + "!" + new CellReference(r, col).formatAsString(false),
                            confidenceFor(e.getValue(), cell, value)
                    ));
                }
                rows.add(new ParsedRow(ref.trim(), r + 1, cells));
            }
        }

        if (rows.isEmpty() && warnings.isEmpty()) {
            warnings.add("The template parsed cleanly but contained no completed rows.");
        }
        return new ParseOutcome(rows, warnings);
    }

    /** Reads the header row and maps each recognised header to its column index. */
    private Map<String, Integer> readHeader(Sheet sheet, List<String> warnings) {
        Map<String, Integer> byHeader = new LinkedHashMap<>();
        Row header = sheet.getRow(HEADER_ROW);
        if (header == null) {
            warnings.add("Header row missing at row " + (HEADER_ROW + 1) + ".");
            return byHeader;
        }
        DataFormatter formatter = new DataFormatter();
        for (int c = header.getFirstCellNum(); c < header.getLastCellNum(); c++) {
            Cell cell = header.getCell(c);
            if (cell == null) continue;
            String text = formatter.formatCellValue(cell).trim();
            if (FIELD_BY_HEADER.containsKey(text)) {
                byHeader.put(text, c);
            }
        }
        for (String required : FIELD_BY_HEADER.keySet()) {
            if (!byHeader.containsKey(required)) {
                warnings.add("Column '" + required + "' not found. "
                        + "Values for it will be left blank for manual entry.");
            }
        }
        return byHeader;
    }

    private String readString(Row row, Integer col, DataFormatter formatter, FormulaEvaluator evaluator) {
        if (col == null) return null;
        Cell cell = row.getCell(col);
        if (cell == null) return null;
        try {
            return formatter.formatCellValue(cell, evaluator);
        } catch (Exception e) {
            // A formula the evaluator cannot handle is not fatal: fall back to the cached value.
            return formatter.formatCellValue(cell);
        }
    }

    /**
     * Confidence is honest rather than decorative.
     *
     * A numeric field read from a genuinely numeric cell is certain. The same field
     * read from text that merely looks numeric is less so, because the entity may
     * have typed "approx 40" or "12 (provisional)". A human is confirming everything
     * either way; this just tells them where to look first.
     */
    private BigDecimal confidenceFor(String fieldName, Cell cell, String value) {
        boolean numericField = fieldName.equals("actualValue")
                || fieldName.equals("variance")
                || fieldName.equals("spendToDate");

        if (!numericField) return new BigDecimal("1.00");

        if (cell != null && (cell.getCellType() == CellType.NUMERIC
                || (cell.getCellType() == CellType.FORMULA
                    && cell.getCachedFormulaResultType() == CellType.NUMERIC))) {
            return new BigDecimal("1.00");
        }
        try {
            new BigDecimal(value.replaceAll("[\\s,R]", ""));
            return new BigDecimal("0.70");   // parses, but was typed as text
        } catch (NumberFormatException e) {
            return new BigDecimal("0.30");   // needs a human
        }
    }
}
