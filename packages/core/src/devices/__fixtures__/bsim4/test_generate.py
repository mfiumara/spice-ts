"""Validate oracle serialization and original input provenance, not simulator parity."""
import hashlib
import json
import math
from pathlib import Path
import tempfile
import unittest
import os

from generate import HERE, ROOT, cases, grid_deck, parse_op, parse_raw


class OracleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = HERE / 'reference'
        cls.reference = json.loads((cls.directory / 'reference.json').read_text())

    def test_grid_shape_source_and_deck_hashes(self):
        records = self.reference['cases']
        self.assertEqual([r['name'] for r in records], [c.name for c in cases()])
        self.assertEqual(sum(len(r['points']) for r in records), 756)
        for case, record in zip(cases(), records):
            deck, points = grid_deck(case)
            self.assertEqual(len(record['points']), 108)
            self.assertEqual((self.directory / f'{case.name}.cir').read_text(), deck)
            self.assertEqual(hashlib.sha256(deck.encode()).hexdigest(), record['deckSha256'])
            if case.source:
                self.assertEqual(hashlib.sha256((ROOT / case.source).read_bytes()).hexdigest(), record['sourceSha256'])
            self.assertEqual(len(set((p['vgs'], p['vds'], p['vbs']) for p in record['points'])), 108)
            for expected, point in zip(points, record['points']):
                for key, value in expected.items():
                    self.assertEqual(point[key], value)
                self.assertTrue(all(math.isfinite(point[q]) for q in ['id', 'gm', 'gds', 'gmbs', 'drainTerminalCurrent']))

    def test_each_json_quantity_matches_native_raw(self):
        for record in self.reference['cases']:
            raw = parse_op(self.directory / f'{record["name"]}.raw')
            self.assertEqual(len(raw), 540)
            for i, point in enumerate(record['points']):
                for quantity in ['id', 'gm', 'gds', 'gmbs']:
                    name = f'i(@m{i}[id])' if quantity == 'id' else f'@m{i}[{quantity}]'
                    self.assertEqual(point[quantity], raw[name])
                self.assertEqual(point['drainTerminalCurrent'], -raw[f'i(vd{i})'])

    def test_binning_original_op_and_native_assertions(self):
        op = self.reference['binningOp']
        self.assertEqual(hashlib.sha256((ROOT / op['sourcePath']).read_bytes()).hexdigest(), op['sourceSha256'])
        self.assertEqual(hashlib.sha256((self.directory / 'binning-op.cir').read_bytes()).hexdigest(), op['deckSha256'])
        self.assertEqual(op['vectors'], parse_op(self.directory / 'binning-op.raw'))
        self.assertEqual(op['vectors']['v(1)'], 0.8693589670633045)
        self.assertEqual(op['vectors']['v(2)'], op['vectors']['v(1)'])
        self.assertEqual(op['vectors']['v(3)'], 1.071660594471147)
        self.assertEqual(op['vectors']['v(4)'], op['vectors']['v(3)'])
        self.assertIn('INFO: 0 of 2 tests failed', (self.directory / 'binning-op.log').read_text())

    def test_all_six_original_dc_sweeps_are_retained(self):
        dc = self.reference['pairDc']
        self.assertEqual(hashlib.sha256((ROOT / dc['sourcePath']).read_bytes()).hexdigest(), dc['sourceSha256'])
        self.assertEqual(hashlib.sha256((self.directory / 'pair-dc.cir').read_bytes()).hexdigest(), dc['deckSha256'])
        self.assertEqual(len(dc['analyses']), 6)
        for i, record in enumerate(dc['analyses'], 1):
            self.assertEqual(record['vectors'], parse_raw(self.directory / f'pair-dc-{i}.raw'))
            self.assertGreater(len(record['vectors']['v(v-sweep)']), 100)

    def test_malformed_or_nonfinite_raw_is_rejected(self):
        original = (self.directory / 'binning-op.raw').read_text()
        for corrupt in [original.replace('No. Variables: 4', 'No. Variables: 5'),
                        original.replace('No. Points: 1', 'No. Points: 2'),
                        original.replace('8.693589670633045', 'nan')]:
            with tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR')) as tmp:
                raw = Path(tmp) / 'corrupt.raw'
                raw.write_text(corrupt)
                with self.assertRaises(ValueError):
                    parse_raw(raw)


if __name__ == '__main__':
    unittest.main()
