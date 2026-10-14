"""Offline completeness and tamper checks for the #855 replay ledger."""
import gzip
import hashlib
import json
import pathlib
import re
import unittest

DIRECTORY = pathlib.Path(__file__).resolve().parent

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def leaves(value, path=''):
    if isinstance(value, dict):
        for key, item in value.items():
            yield from leaves(item, f'{path}/{key}')
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from leaves(item, f'{path}/{index}')
    else:
        yield path, value

def expected_transitions(runs):
    result = []
    for before, after in zip(runs, runs[1:]):
        for old, new in zip(before['rows'], after['rows']):
            if old == new:
                continue
            left, right = dict(leaves(old)), dict(leaves(new))
            result.append((after['commit'], old['key'], digest(old), digest(new), [{'path': path, 'before': left.get(path), 'after': right.get(path)} for path in sorted(set(left) | set(right)) if left.get(path) != right.get(path)]))
    return result

def verify(ledger, raw_runs):
    by_commit = {run['commit']: run for run in raw_runs}
    assert len(by_commit) == len(raw_runs), 'duplicate commit'
    assert set(by_commit) == {entry['commit'] for entry in ledger['schedule']}, 'missing revision'
    runs = [by_commit[entry['commit']] for entry in ledger['schedule']]
    subjects = {entry['commit']: entry['subject'] for entry in ledger['schedule']}
    for row in ledger['transitions']:
        assert row['subject'] == subjects[row['commit']], 'altered attribution subject'
        assert row['pullRequest'] == int(re.findall(r'\(#(\d+)\)', row['subject'])[-1]), 'altered PR attribution'
    for run in runs:
        assert len(run['rows']) == len({row['key'] for row in run['rows']}) == 100, 'fixture accounting'
    actual = [(row['commit'], row['fixture'], row['beforeSha256'], row['afterSha256'], row['changes']) for row in ledger['transitions']]
    assert actual == expected_transitions(runs), 'incomplete or altered per-field attribution'
    return runs

class LedgerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with gzip.open(DIRECTORY / 'ledger.json.gz', 'rt') as file:
            cls.ledger = json.load(file)
        with gzip.open(DIRECTORY / 'replay.jsonl.gz', 'rt') as file:
            cls.raw_runs = [json.loads(line) for line in file]

    def test_complete_attribution_and_actual_endpoint(self):
        runs = verify(self.ledger, self.raw_runs)
        report = json.loads((DIRECTORY.parent / 'aggregate-report.json').read_text())
        actual = [{'key': f['key'], 'status': f['spiceTs']['status'], 'convergence': f['spiceTs']['convergence'], 'analyses': f['spiceTs']['analyses'], 'comparisons': f['comparisons']} for f in report['fixtures']]
        self.assertEqual(runs[-1]['rows'], actual)
        self.assertEqual(self.ledger['harnessDrift'], [])

    def test_missing_transition_is_rejected(self):
        altered = dict(self.ledger, transitions=self.ledger['transitions'][1:])
        with self.assertRaisesRegex(AssertionError, 'attribution'):
            verify(altered, self.raw_runs)

    def test_missing_revision_is_rejected(self):
        with self.assertRaisesRegex(AssertionError, 'revision'):
            verify(self.ledger, self.raw_runs[1:])

if __name__ == '__main__':
    unittest.main()
