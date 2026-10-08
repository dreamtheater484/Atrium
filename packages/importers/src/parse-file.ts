import { parseArchimate } from './archimate';
import { parseAtriumYaml } from './atrium-yaml';
import { parseBackstage } from './backstage';
import { readCsv } from './csv';
import { detectFormat, isLegacyOffice } from './detect-format';
import { readJson } from './json';
import { baseName, decodeText } from './text';
import type { NormalizedModel, ParsedFile } from './types';
import { readXlsx } from './xlsx';

const SUPPORTED =
  'Excel (.xlsx), CSV, JSON, ArchiMate exchange files (.xml), Backstage catalog files and atrium.yaml';

function withModel(
  format: ParsedFile['format'],
  model: NormalizedModel,
  warnings: string[] = [],
): ParsedFile {
  return { format, model, warnings: [...warnings, ...model.warnings] };
}

/**
 * Reads any supported file. Tabular formats return `sheets` (to map with `detectElementType`
 * and `guessMapping`); model formats return a ready `model`. Never throws: problems are
 * reported in `warnings`.
 */
export async function parseFile(fileName: string, data: Uint8Array): Promise<ParsedFile> {
  const format = detectFormat(fileName, data);
  try {
    switch (format) {
      case 'xlsx': {
        const { sheets, warnings } = await readXlsx(data);
        if (!sheets.length) warnings.push('No sheet in the workbook has data');
        return { format, sheets, warnings };
      }
      case 'csv': {
        const { sheet, warnings } = readCsv(decodeText(data), baseName(fileName));
        return { format, sheets: sheet ? [sheet] : [], warnings };
      }
      case 'json': {
        const { sheets, warnings } = readJson(decodeText(data), baseName(fileName));
        return { format, sheets, warnings };
      }
      case 'archimate':
        return withModel(format, parseArchimate(decodeText(data)));
      case 'backstage':
        return withModel(format, parseBackstage(decodeText(data)));
      case 'atrium-yaml':
        return withModel(format, parseAtriumYaml(decodeText(data)));
      case 'unknown':
        return {
          format,
          warnings: [
            isLegacyOffice(data)
              ? 'This is an old Excel 97-2003 (.xls) file. Save it as .xlsx in Excel and import it again.'
              : `Atrium could not recognise this file. Supported formats: ${SUPPORTED}.`,
          ],
        };
    }
  } catch (err) {
    return { format, warnings: [`The file could not be read: ${(err as Error).message}`] };
  }
}
