import { readFile } from 'node:fs/promises';
import { BenchmarkInputError, buildReport, parseResultCsv } from './lib.mjs';

const USAGE = `Usage: node tools/benchmark/benchmark.mjs --input <local-results.csv> [options]

Options:
  --threshold <0..1>   Evaluate FAR/FRR at this threshold.
  --target-far <0..1>  Recommend the lowest-FRR threshold that meets the target.
  --format json|text   Output format (default: json).

CSV header: subjectId,label,score
Labels: genuine (same person) or impostor (different person).
Scores must be similarity scores from 0 to 1. Do not commit completed datasets.`;

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (!options.input) {
    throw new BenchmarkInputError('--input is required. Run with --help for usage.');
  }
  if (options.format !== undefined && options.format !== 'json' && options.format !== 'text') {
    throw new BenchmarkInputError('--format must be json or text.');
  }

  const csv = await readFile(options.input, 'utf8');
  const records = parseResultCsv(csv);
  const report = buildReport(records, {
    threshold: parseOptionalNumber(options.threshold, '--threshold'),
    targetFar: parseOptionalNumber(options.targetFar, '--target-far'),
  });

  process.stdout.write(
    options.format === 'text' ? formatText(report) : `${JSON.stringify(report, null, 2)}\n`,
  );
}

function parseOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (!argument.startsWith('--') || index + 1 >= argv.length) {
      throw new BenchmarkInputError(`Invalid argument "${argument}". Run with --help for usage.`);
    }
    const key = argument.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    options[key] = argv[index + 1];
    index += 1;
  }
  return options;
}

function parseOptionalNumber(raw, name) {
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new BenchmarkInputError(`${name} must be a number from 0 to 1.`);
  }
  return value;
}

function formatText(report) {
  return [
    `samples: ${report.sampleSize} (genuine ${report.genuineCount}, impostor ${report.impostorCount})`,
    `evaluated threshold: ${report.evaluatedThreshold}`,
    `FAR: ${formatRate(report.far)}`,
    `FRR: ${formatRate(report.frr)}`,
    `recommended threshold: ${report.recommendation.threshold} (${report.recommendation.basis})`,
    '',
  ].join('\n');
}

function formatRate(value) {
  return value === null ? 'n/a' : `${(value * 100).toFixed(3)}%`;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
