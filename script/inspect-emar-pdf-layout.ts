import fs from "node:fs";
import path from "node:path";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const DATE_PATTERNS = [
	/\b(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)[,.]?\s*\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/gi,
	/\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/gi,
	/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g,
	/\b\d{1,2}-\d{1,2}-\d{2,4}\b/g,
];

const TIME_SLOT_PATTERN = /\b\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}\b/g;

type Hit = { page: number; text: string; x: number; y: number; width: number };

async function main() {
	const pdfPath = process.argv[2];
	if (!pdfPath) {
		console.error("Usage: tsx script/inspect-emar-pdf-layout.ts <path-to-pdf>");
		process.exit(1);
	}

	const absolutePath = path.resolve(process.cwd(), pdfPath);
	const buffer = fs.readFileSync(absolutePath);
	const uint8Array = new Uint8Array(buffer);

	// Node script: disable worker to avoid PDF.js API/worker version mismatches.
	const loadingTask = pdfjsLib.getDocument({
		data: uint8Array,
		disableWorker: true,
		standardFontDataUrl: new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url).toString(),
		useSystemFonts: true,
	} as any);
	const pdf = await loadingTask.promise;

	const dateHits: Hit[] = [];
	const timeSlotHits: Hit[] = [];

  const pdfjsUtil = (pdfjsLib as any).Util;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
		const page = await pdf.getPage(pageNum);
		const textContent = await page.getTextContent();
		const viewport = page.getViewport({ scale: 1.0 });

      for (const item of textContent.items as any[]) {
        if (!item?.str || !String(item.str).trim()) continue;
        const str = String(item.str).trim();
        const tx = pdfjsUtil.transform(viewport.transform, item.transform);
        const x = tx[4];
        const y = tx[5];
        const width = item.width || 0;

			for (const pat of DATE_PATTERNS) {
				const matches = Array.from(str.matchAll(pat));
				for (const m of matches) {
					if (!m[0]) continue;
					dateHits.push({ page: pageNum, text: m[0], x, y, width });
				}
			}

			const slotMatches = Array.from(str.matchAll(TIME_SLOT_PATTERN));
			for (const m of slotMatches) {
				if (!m[0]) continue;
				timeSlotHits.push({ page: pageNum, text: m[0].replace("–", "-"), x, y, width });
			}
		}
	}

	const normalize = (s: string) => s.trim().replace(/\s+/g, " ");
	const summarize = (hits: Hit[]) => {
		const byText = new Map<string, Hit[]>();
		for (const h of hits) {
			const key = normalize(h.text);
			if (!byText.has(key)) byText.set(key, []);
			byText.get(key)!.push(h);
		}
		return Array.from(byText.entries())
			.map(([text, hs]) => ({
				text,
				count: hs.length,
				pages: Array.from(new Set(hs.map(h => h.page))).sort((a, b) => a - b),
				minX: Math.min(...hs.map(h => h.x)),
				maxX: Math.max(...hs.map(h => h.x)),
				minY: Math.min(...hs.map(h => h.y)),
				maxY: Math.max(...hs.map(h => h.y)),
			}))
			.sort((a, b) => b.count - a.count);
	};

	const dateSummary = summarize(dateHits);
	const slotSummary = summarize(timeSlotHits);

	const byPage = (hits: Hit[]) => {
		const map = new Map<number, Hit[]>();
		for (const h of hits) {
			if (!map.has(h.page)) map.set(h.page, []);
			map.get(h.page)!.push(h);
		}
		return map;
	};

	const dateByPage = byPage(dateHits);
	const slotByPage = byPage(timeSlotHits);

	console.log("=== PDF LAYOUT INSPECTOR ===");
	console.log("Pages:", pdf.numPages);
	console.log("Date hits:", dateHits.length, "Unique:", dateSummary.length);
	console.log(
		"Top date strings:",
		dateSummary
			.slice(0, 20)
			.map(d => `${d.text} (n=${d.count}, pages=${d.pages.join("/")}, x=${d.minX.toFixed(1)}-${d.maxX.toFixed(1)}, y=${d.minY.toFixed(1)}-${d.maxY.toFixed(1)})`)
			.join("\n")
	);
	console.log("---");
	console.log("Time-slot hits:", timeSlotHits.length, "Unique:", slotSummary.length);
	console.log(
		"Top time slots:",
		slotSummary
			.slice(0, 20)
			.map(d => `${d.text} (n=${d.count}, pages=${d.pages.join("/")}, x=${d.minX.toFixed(1)}-${d.maxX.toFixed(1)}, y=${d.minY.toFixed(1)}-${d.maxY.toFixed(1)})`)
			.join("\n")
	);
	console.log("---");
	console.log("Per-page summary:");
	for (let page = 1; page <= pdf.numPages; page++) {
		const dHits = dateByPage.get(page) || [];
		const sHits = slotByPage.get(page) || [];
		const dUnique = Array.from(new Set(dHits.map(h => normalize(h.text))));
		const sUnique = Array.from(new Set(sHits.map(h => normalize(h.text))));
		const dX = dHits.length ? `${Math.min(...dHits.map(h => h.x)).toFixed(1)}-${Math.max(...dHits.map(h => h.x)).toFixed(1)}` : "-";
		const dY = dHits.length ? `${Math.min(...dHits.map(h => h.y)).toFixed(1)}-${Math.max(...dHits.map(h => h.y)).toFixed(1)}` : "-";
		const sX = sHits.length ? `${Math.min(...sHits.map(h => h.x)).toFixed(1)}-${Math.max(...sHits.map(h => h.x)).toFixed(1)}` : "-";
		const sY = sHits.length ? `${Math.min(...sHits.map(h => h.y)).toFixed(1)}-${Math.max(...sHits.map(h => h.y)).toFixed(1)}` : "-";

		console.log(
			`Page ${page}: dates=${dUnique.length} (hits=${dHits.length}, x=${dX}, y=${dY}) | slots=${sUnique.length} (hits=${sHits.length}, x=${sX}, y=${sY})`
		);
		if (page <= 4) {
			console.log(`  date examples: ${dUnique.slice(0, 8).join(" | ")}`);
			console.log(`  slot examples: ${sUnique.slice(0, 8).join(" | ")}`);
		}
	}
	console.log("============================");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
