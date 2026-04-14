import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function tryConvertOfficeToPdf(buffer: Buffer, originalName: string): Promise<Buffer | null> {
  const ext = path.extname(originalName).toLowerCase();
  if (![".doc", ".docx"].includes(ext)) return null;

  let tempDir: string | null = null;

  try {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "office-upload-"));
    const inputPath = path.join(tempDir, `input${ext || ".docx"}`);
    await fs.writeFile(inputPath, buffer);

    const runConversion = async (command: string): Promise<Buffer | null> => {
      try {
        await execFileAsync(command, ["--headless", "--convert-to", "pdf", "--outdir", tempDir!, inputPath], {
          timeout: 15000,
        });
        return await fs.readFile(path.join(tempDir!, "input.pdf"));
      } catch {
        return null;
      }
    };

    return (await runConversion("soffice")) || (await runConversion("libreoffice"));
  } catch {
    return null;
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}