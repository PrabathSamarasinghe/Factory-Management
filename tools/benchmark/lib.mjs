export const REQUIRED_COLUMNS = Object.freeze(['subjectId', 'label', 'score']);

export class BenchmarkInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BenchmarkInputError';
  }
}

export function parseResultCsv(text) {
  const rows = parseCsvRows(typeof text === 'string' ? text : String(text ?? ''));
  if (rows.length === 0) {
    throw new BenchmarkInputError('The CSV must contain a header row.');
  }

  const header = rows[0].map((column) => column.trim().toLowerCase());
  const expected = REQUIRED_COLUMNS.map((column) => column.toLowerCase()).sort();
  const actual = [...header].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new BenchmarkInputError(`CSV columns must be exactly ${REQUIRED_COLUMNS.join(',')}.`);
  }

  const indexes = {
    subjectId: header.indexOf('subjectid'),
    label: header.indexOf('label'),
    score: header.indexOf('score'),
  };

  return rows.slice(1).map((row, offset) => {
    if (row.length !== header.length) {
      throw new BenchmarkInputError(`Row ${offset + 2} has the wrong number of columns.`);
    }
    const subjectId = row[indexes.subjectId].trim();
    const label = row[indexes.label].trim().toLowerCase();
    if (subjectId.length === 0) {
      throw new BenchmarkInputError(`Row ${offset + 2} is missing subjectId.`);
    }
    if (label !== 'genuine' && label !== 'impostor') {
      throw new BenchmarkInputError(`Row ${offset + 2} label must be "genuine" or "impostor".`);
    }
    const score = Number(row[indexes.score]);
    if (!Number.isFinite(score) || score < 0 || score > 1) {
      throw new BenchmarkInputError(`Row ${offset + 2} score must be a number from 0 to 1.`);
    }
    return { subjectId, genuine: label === 'genuine', score };
  });
}

export function confusionAt(records, threshold) {
  assertThreshold(threshold);
  let genuineCount = 0;
  let impostorCount = 0;
  let falseAccepts = 0;
  let falseRejects = 0;

  for (const record of records) {
    if (record.genuine) {
      genuineCount += 1;
      if (record.score < threshold) {
        falseRejects += 1;
      }
    } else {
      impostorCount += 1;
      if (record.score >= threshold) {
        falseAccepts += 1;
      }
    }
  }

  return {
    threshold,
    falseAccepts,
    falseRejects,
    genuineCount,
    impostorCount,
    far: impostorCount === 0 ? null : falseAccepts / impostorCount,
    frr: genuineCount === 0 ? null : falseRejects / genuineCount,
  };
}

export function recommendThreshold(records, options = {}) {
  assertComparisons(records);
  const targetFar = options.targetFar;
  if (targetFar !== undefined) {
    assertThreshold(targetFar);
  }

  const candidates = candidateThresholds(records);
  const evaluated = candidates.map((threshold) => confusionAt(records, threshold));
  if (targetFar !== undefined) {
    const eligible = evaluated.filter((result) => result.far !== null && result.far <= targetFar);
    if (eligible.length > 0) {
      eligible.sort((left, right) => left.frr - right.frr || right.threshold - left.threshold);
      return { ...eligible[0], basis: 'target-far', targetFar };
    }
    evaluated.sort((left, right) => left.frr - right.frr || left.far - right.far);
    return { ...evaluated[0], basis: 'target-far-unmet', targetFar };
  }

  evaluated.sort(
    (left, right) =>
      left.far + left.frr - (right.far + right.frr) || right.threshold - left.threshold,
  );
  return { ...evaluated[0], basis: 'balanced-error' };
}

export function buildReport(records, options = {}) {
  assertComparisons(records);
  const threshold = options.threshold ?? recommendThreshold(records, options).threshold;
  const metrics = confusionAt(records, threshold);
  const recommendation = recommendThreshold(records, options);
  return {
    sampleSize: records.length,
    genuineCount: metrics.genuineCount,
    impostorCount: metrics.impostorCount,
    evaluatedThreshold: threshold,
    far: metrics.far,
    frr: metrics.frr,
    falseAccepts: metrics.falseAccepts,
    falseRejects: metrics.falseRejects,
    recommendation,
  };
}

export function candidateThresholds(records) {
  const scores = [...new Set(records.map((record) => record.score))].sort(
    (left, right) => left - right,
  );
  const candidates = new Set([0, 1]);
  for (let index = 0; index < scores.length; index += 1) {
    candidates.add(scores[index]);
    if (index + 1 < scores.length) {
      candidates.add((scores[index] + scores[index + 1]) / 2);
    }
  }
  return [...candidates].sort((left, right) => left - right);
}

function assertComparisons(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new BenchmarkInputError('The CSV must contain at least one comparison row.');
  }
  if (!records.some((record) => record.genuine) || !records.some((record) => !record.genuine)) {
    throw new BenchmarkInputError('The CSV must include both genuine and impostor comparisons.');
  }
}

function assertThreshold(threshold) {
  if (
    typeof threshold !== 'number' ||
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    threshold > 1
  ) {
    throw new BenchmarkInputError('Threshold and target FAR must be numbers from 0 to 1.');
  }
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (quoted) {
    throw new BenchmarkInputError('The CSV contains an unterminated quoted field.');
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((cell) => cell.trim().length > 0));
}
