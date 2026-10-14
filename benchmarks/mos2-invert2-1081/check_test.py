"""Receipt portability tests; run with python3 .../check_test.py."""
import copy
import unittest

import check


class ReceiptTests(unittest.TestCase):
    def setUp(self):
        self.receipt = {
            "fixtures": [{"id": "m-19", "before": {
                "rms": 0.09353225592024875, "max": 1.8560836650731265,
                "points": 1956, "worst": {"normalized": 0.38022371053385456},
            }}],
            "artifactSha256": {"before-waveforms.json.gz": "original"},
            "aliasExecutionsIdentical": True,
        }
        self.actual = copy.deepcopy(self.receipt)

    def test_roundoff_is_portable_without_mutating_receipts(self):
        self.actual["fixtures"][0]["before"]["rms"] *= 1 + 1e-14
        original = copy.deepcopy(self.actual)
        check.assert_receipt(self.actual, self.receipt)
        self.assertEqual(self.actual, original)

    def test_material_rms_drift_and_nonfinite_values_fail(self):
        for value in (0.09353225592024875 * (1 + 1e-12), float("nan"), float("inf"), 0.0):
            with self.subTest(value=value):
                self.actual["fixtures"][0]["before"]["rms"] = value
                with self.assertRaises(AssertionError):
                    check.assert_receipt(self.actual, self.receipt)

    def test_other_fields_remain_exact(self):
        mutations = (
            lambda r: r["artifactSha256"].update({"before-waveforms.json.gz": "changed"}),
            lambda r: r["fixtures"][0].update(id="m-20"),
            lambda r: r.update(aliasExecutionsIdentical=False),
            lambda r: r["fixtures"][0]["before"].update(points=1957),
            lambda r: r["fixtures"][0]["before"].update(max=1.8560836650731267),
            lambda r: r["fixtures"][0]["before"]["worst"].update(normalized=0.3802237105338546),
            lambda r: r["fixtures"][0]["before"].update(extra=1),
            lambda r: r["fixtures"][0].update(unknown={"rms": 1.0}),
        )
        for mutate in mutations:
            actual = copy.deepcopy(self.receipt)
            mutate(actual)
            with self.subTest(actual=actual), self.assertRaises(AssertionError):
                check.assert_receipt(actual, self.receipt)

    def test_retained_waveforms_match_receipt(self):
        import json
        check.assert_receipt(check.summarize(), json.loads((check.ROOT / "summary.json").read_text()))


if __name__ == "__main__":
    unittest.main()
