import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  BenchmarkInputError,
  REQUIRED_COLUMNS,
  buildReport,
  confusionAt,
  parseResultCsv,
  recommendThreshold,
} from './lib.mjs';

const SAMPLE = `subjectId,label,score
p-1,genuine,0.90
p-1,genuine,0.70
p-2,impostor,0.60
p-2,impostor,0.20
`;

test('parses only the consented result columns', () => {
  assert.deepEqual(REQUIRED_COLUMNS, ['subjectId', 'label', 'score']);
  assert.deepEqual(parseResultCsv(SAMPLE), [
    { subjectId: 'p-1', genuine: true, score: 0.9 },
    { subjectId: 'p-1', genuine: true, score: 0.7 },
    { subjectId: 'p-2', genuine: false, score: 0.6 },
    { subjectId: 'p-2', genuine: false, score: 0.2 },
  ]);
});

test('the template has a header and no data', async () => {
  const template = await readFile(
    new URL('./dataset-results.template.csv', import.meta.url),
    'utf8',
  );
  assert.deepEqual(parseResultCsv(template), []);
  assert.throws(() => buildReport([]), BenchmarkInputError);
});

test('computes FAR and FRR at a threshold', () => {
  const records = parseResultCsv(SAMPLE);
  const metrics = confusionAt(records, 0.8);
  assert.equal(metrics.falseAccepts, 0);
  assert.equal(metrics.falseRejects, 1);
  assert.equal(metrics.far, 0);
  assert.equal(metrics.frr, 0.5);
});

test('recommends a balanced threshold and a target-FAR threshold', () => {
  const records = parseResultCsv(SAMPLE);
  const balanced = recommendThreshold(records);
  assert.equal(balanced.threshold, 0.7);
  assert.equal(balanced.far, 0);
  assert.equal(balanced.frr, 0);

  const constrained = recommendThreshold(records, { targetFar: 0.01 });
  assert.equal(constrained.threshold, 0.7);
  assert.equal(constrained.basis, 'target-far');

  const report = buildReport(records, { threshold: 0.8, targetFar: 0.01 });
  assert.equal(report.evaluatedThreshold, 0.8);
  assert.equal(report.frr, 0.5);
  assert.equal(report.recommendation.threshold, 0.7);
});

test('rejects invalid labels, scores and missing comparison groups', () => {
  assert.throws(() => parseResultCsv('subjectId,label,score\np-1,unknown,0.8\n'), /label must be/);
  assert.throws(() => parseResultCsv('subjectId,label,score\np-1,genuine,1.5\n'), /score must be/);
  assert.throws(() => parseResultCsv('subjectId,label\np-1,genuine\n'), /CSV columns/);
  assert.throws(
    () => buildReport(parseResultCsv('subjectId,label,score\np-1,genuine,0.8\n')),
    /both genuine and impostor/,
  );
});
