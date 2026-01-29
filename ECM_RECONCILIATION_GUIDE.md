# ECM Call Reconciliation - Manual Process Guide

## Overview

This guide explains how to manually prepare an ECM (Electronic Call Monitoring) data export for billing/compliance submission by removing unnecessary columns and adding variation codes.

**Estimated time:** Approximately 1 hour per file

---

## Step 1: Export Your ECM Data

1. Log into your ECM system
2. Export all call data as an Excel (.xlsx) or CSV file
3. Save the file to your computer

---

## Step 2: Open the File in Excel

1. Open Microsoft Excel (or Google Sheets)
2. Open your exported ECM data file
3. Note: The raw export typically contains columns A through FW (approximately 179 columns)

---

## Step 3: Identify Key Columns Before Deletion

Before deleting any columns, **note the values** in these two columns for each row:

- **Column U** — "Service Requirement"
- **Column DZ** — "Cancellation Reason"

You'll need these values to determine the Variation Reason codes in Step 5.

> **Tip:** Copy columns U and DZ to a separate sheet or notepad before proceeding.

---

## Step 4: Delete Unnecessary Columns

Delete the following columns. **Work right to left** to avoid column shifting issues:

| Columns to Delete | Range | Description |
| ------------------- | ------- | ------------- |
| EA to FW | Columns 131–179 | Delete first (rightmost) |
| DZ | Column 130 | After noting Cancellation Reason |
| BR to DY | Columns 70–129 | Large block |
| AP to BO | Columns 42–67 | |
| AH to AM | Columns 34–39 | |
| AE | Column 31 | Single column |
| Z to AD | Columns 26–30 | |
| V to W | Columns 22–23 | |
| U | Column 21 | After noting Service Requirement |
| K to T | Columns 11–20 | |
| G to I | Columns 7–9 | |
| A to E | Columns 1–5 | Delete last (leftmost) |

**How to delete columns in Excel:**

1. Click the column header letter to select the entire column
2. Hold Ctrl (or Cmd on Mac) and click additional column headers to select multiple
3. Right-click on any selected column header
4. Choose "Delete"

---

## Step 5: Add "Variation Reason" Column

1. At the end of your remaining columns, add a new column header: **"Variation Reason"**
2. For each data row, apply the appropriate variation code based on the Service Requirement and Cancellation Reason values you noted in Step 3

---

## Step 6: Format Date/Time Columns

Ensure any remaining date/time columns are formatted consistently:

1. Select the date/time columns
2. Right-click → Format Cells
3. Choose "Custom"
4. Enter format: `DD/MM/YYYY HH:MM:SS`
5. Click OK

---

## Step 7: Save the Processed File

1. **Save as a new file** (don't overwrite the original)
2. Suggested naming convention: `reconciled_YYYY-MM-DD.xlsx`
3. Use Excel format (.xlsx) for best compatibility

---

## Notes

- This manual process takes approximately **1 hour** per file depending on the number of rows
- The automated Call Reconciliation tool in the system completes this process in seconds
- Always keep a backup of your original ECM export before making changes

---

## Troubleshooting

| Issue | Solution |
| ------- | ---------- |
| Columns shifted after deletion | Work right-to-left when deleting columns |
| Can't find Column U or DZ | Check if columns were already deleted; column letters change after deletion |
| Date formatting looks wrong | Re-apply custom date format DD/MM/YYYY HH:MM:SS |
| File won't save as .xlsx | Ensure you're using "Save As" not "Save", and select Excel Workbook format |

---

Document Version: 1.0 | Last Updated: January 2026
