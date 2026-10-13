# SPDX-License-Identifier: MIT
"""Offline receipt checks. --parity additionally asserts the future GREEN contract."""
import hashlib
import json
import math
from pathlib import Path

import sys
import unittest

HERE = Path(__file__).resolve().parent
REPORT = json.loads((HERE / "receipt.json").read_text())
MATRIX = json.loads((HERE / "matrix.json").read_text())
ROWS = {row["id"]: row for row in REPORT["rows"]}
# Literal contract pinned only after the fresh ngspice-47 run.
EXPECTED = {
    "issue-888": [0.25], "caller-shadows-global": [0.25], "global-fallback": [0.1],
    "callee-default-shadows-caller": [0.2], "callee-local-shadows-caller": [0.2],
    "explicit-shadows-default": [1/3], "default-reads-caller": [0.25],
    "override-reads-caller": [1/7], "local-reads-caller": [1/7],
    "three-level-nearest": [0.2], "three-level-fallback": [0.25],
    "repeated-siblings": [0.25, 0.2, 0.25], "lexical-param-857": [0.25],
    "lexical-model-854": [-0.0001187196295587072, -0.01190421263617118],
    "lexical-model-not-dynamic": [-0.0001187196295587072],
    "lexical-definition-dynamic-param": [0.2],
}
FAILURES = {"issue-888", "default-reads-caller", "local-reads-caller",
            "three-level-nearest", "three-level-fallback", "repeated-siblings"}


def decode_raw(text):
    header, data = text.split("Values:\n")
    columns = [line.split()[1] for line in header.split("Variables:\n")[1].splitlines() if line.strip()]
    tokens = data.split()
    assert tokens.pop(0) == "0"
    assert len(columns) == len(tokens)
    return dict(zip(columns, map(float, tokens)))


class Evidence(unittest.TestCase):
    def test_complete_same_byte_matrix(self):
        self.assertEqual(len(MATRIX), 16)
        self.assertEqual(set(ROWS), set(EXPECTED))
        self.assertEqual(len(ROWS), len(REPORT["rows"]))
        for case in MATRIX:
            row = ROWS[case["id"]]
            self.assertEqual(row["observe"], case["observe"])
            self.assertEqual(row["purpose"], case["purpose"])
            path = HERE / "decks" / (case["id"] + ".cir")
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            self.assertEqual(digest, row["deckHashBefore"])
            self.assertEqual(digest, row["deckHashAfter"])
            for backend in ["reference", "native"]:
                self.assertEqual(row[backend]["argv"][-1 if backend == "reference" else -2],
                                 row["reference"]["argv"][-1])
                self.assertTrue(row["reference"]["argv"][-1].endswith("/decks/" + path.name))
            self.assertEqual(row["reference"]["argv"][:4], ["ngspice", "-n", "-b", "-r"])
        issue = (HERE / "decks/issue-888.cir").read_text()
        self.assertNotIn(".control", issue)
        self.assertTrue(issue.startswith("dynamic numparam scope\n"))

    def test_pinned_sources_and_versions(self):
        self.assertEqual(REPORT["source"]["revision"], "a80f6e3e95d51534905b1f23410a951802666656")
        self.assertEqual(REPORT["source"]["revisionReceipt"]["stdout"].strip(), REPORT["source"]["revision"])
        self.assertIn("ngspice-47", REPORT["metadata"]["ngspiceVersion"]["stdout"])
        self.assertEqual(len(REPORT["source"]["hashes"]), 6)
        for path, digest in REPORT["source"]["hashes"].items():
            self.assertRegex(digest, r"^[0-9a-f]{64}$")
            local = HERE / ".run/upstream" / path
            if local.exists():
                self.assertEqual(hashlib.sha256(local.read_bytes()).hexdigest(), digest)

    def test_child_budget_accounting(self):
        children = [REPORT["metadata"][key] for key in ["baseline", "ngspiceVersion", "nodeVersion", "pnpmVersion"]]
        children.append(REPORT["source"]["revisionReceipt"])
        children += [row[key] for row in ROWS.values() for key in ["reference", "native"]]
        self.assertAlmostEqual(sum(child["seconds"] for child in children), REPORT["actualChildSeconds"], places=10)
        self.assertLessEqual(REPORT["actualChildSeconds"], 300)
        self.assertEqual(REPORT["limits"], dict(cases=20, directChildSeconds=12, cumulativeChildSeconds=300))
        for child in children:
            self.assertGreater(child["seconds"], 0)
            self.assertLessEqual(child["seconds"], 12)
            self.assertFalse(child["timedOut"])
            self.assertIsNone(child["signal"])

    def test_reference_contract_from_raw(self):
        for name, expected in EXPECTED.items():
            row = ROWS[name]
            self.assertEqual(row["reference"]["exit"], 0)
            self.assertIsNone(row["referenceError"])
            raw = decode_raw(row["referenceRaw"])
            for observation, value in zip(row["observe"], expected):
                self.assertEqual(raw[observation], row["referenceValues"][observation])
                self.assertAlmostEqual(value, raw[observation], places=14)

    def test_native_failures_and_recomputed_metrics(self):
        for name, row in ROWS.items():
            if name in FAILURES:
                self.assertEqual(row["native"]["exit"], 1)
                self.assertIn("pp", row["nativeError"])
                self.assertIsNone(row["nativeValues"])
                self.assertIsNone(row["metrics"])
                self.assertEqual(json.loads(row["native"]["stdout"])["status"], "failure")
                continue
            self.assertEqual(row["native"]["exit"], 0)
            self.assertEqual(json.loads(row["native"]["stdout"])["values"], row["nativeValues"])
            errors = [abs(row["nativeValues"][key] - value) for key, value in row["referenceValues"].items()]
            relative = [abs(row["nativeValues"][key] - value)/abs(value) for key, value in row["referenceValues"].items()]
            self.assertEqual(row["metrics"]["maxAbsolute"], max(errors))
            self.assertEqual(row["metrics"]["rmsAbsolute"], math.sqrt(sum(e*e for e in errors)/len(errors)))
            self.assertEqual(row["metrics"]["maxRelative"], max(relative))
            self.assertEqual(row["metrics"]["rmsRelative"], math.sqrt(sum(e*e for e in relative)/len(relative)))
        self.assertAlmostEqual(ROWS["caller-shadows-global"]["metrics"]["maxRelative"], 0.6)
        self.assertAlmostEqual(ROWS["lexical-definition-dynamic-param"]["metrics"]["maxRelative"], 0.25)


class FutureParity(unittest.TestCase):
    def test_next_fix_contract(self):
        for name, row in ROWS.items():
            with self.subTest(case=name):
                self.assertIsNotNone(row["nativeValues"], row["nativeError"])
                for observation, value in zip(row["observe"], EXPECTED[name]):
                    # One fixed tolerance for every OP observation, not circuit tuning.
                    self.assertTrue(math.isclose(row["nativeValues"][observation], value, rel_tol=1e-6, abs_tol=1e-12))


if __name__ == "__main__":
    parity = "--parity" in sys.argv
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(FutureParity if parity else Evidence)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    sys.exit(not result.wasSuccessful())
