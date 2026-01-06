import fs from "node:fs";
import path from "node:path";
import { parseEMARGrid } from "../server/emarGridParser";

async function main() {
	const pdfPath = process.argv[2];
	if (!pdfPath) {
		console.error("Usage: tsx script/debug-emar-grid.ts <path-to-pdf>");
		process.exit(1);
	}

	const absolutePath = path.resolve(process.cwd(), pdfPath);
	const buffer = fs.readFileSync(absolutePath);

	const result = await parseEMARGrid(buffer);

	const codeCounts = new Map<string, number>();
	for (const cell of result.cells) {
		const code = (cell.code || "BLANK").toUpperCase();
		codeCounts.set(code, (codeCounts.get(code) || 0) + 1);
	}
	const sortedCodes = Array.from(codeCounts.entries()).sort((a, b) => b[1] - a[1]);

	console.log("=== EMAR GRID PARSER SUMMARY ===");
	console.log("Service user initials:", result.serviceUserName || "(not detected)");
	console.log("Allergies:", result.allergies || "(not detected)");
	console.log("Pages parsed:", Math.max(...(result.cells.map(c => (c as any).page || 1)), 1));
	console.log("Dates detected:", result.dates.length);
	console.log("Dates:", result.dates.slice(0, 20).join(", ") + (result.dates.length > 20 ? " ..." : ""));
	console.log("Time slots detected:", result.timeSlots.length);
	console.log("Time slots:", result.timeSlots.slice(0, 20).join(", ") + (result.timeSlots.length > 20 ? " ..." : ""));
	console.log("Medications detected:", result.medications.length);
	console.log(
		"Medication samples:",
		result.medications
			.slice(0, 12)
			.map(m => m.name)
			.join(" | ") + (result.medications.length > 12 ? " ..." : "")
	);
	console.log("Cells generated:", result.cells.length);
	console.log(
		"Code distribution (top 12):",
		sortedCodes
			.slice(0, 12)
			.map(([c, n]) => `${c}:${n}`)
			.join(", ")
	);
	console.log("Debug info:", result.debugInfo);
	console.log("================================");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
