from __future__ import annotations

import unittest

from galatura_trips.receipt import (
    WeighingSlip,
    clear_print_hooks,
    print_text,
    register_print_hook,
    render_label,
    render_receipt,
)


def sample_slip() -> WeighingSlip:
    return WeighingSlip(
        reference="W-1001",
        trip_id="trip-7",
        supplier="S-42",
        gross_kg="1200.500",
        tare_kg="10.000",
        net_kg="1190.500",
        bags="24",
        weighed_at="2026-11-25T08:30:00Z",
        scale_id="SCALE-9",
        grade="BOP",
        operator="clerk-1",
    )


class ReceiptTests(unittest.TestCase):
    def tearDown(self) -> None:
        clear_print_hooks()

    def test_render_receipt_contains_weight_breakdown(self) -> None:
        receipt = render_receipt(sample_slip())

        self.assertIn("WEIGHING RECEIPT", receipt)
        self.assertIn("Gross: 1200.500 kg", receipt)
        self.assertIn("Net: 1190.500 kg", receipt)
        self.assertIn("Bags: 24", receipt)

    def test_render_label_is_single_line(self) -> None:
        label = render_label(sample_slip())

        self.assertNotIn("\n", label)
        self.assertIn("NET 1190.500 KG", label)
        self.assertIn("SCALE SCALE-9", label)

    def test_print_text_uses_registered_hook(self) -> None:
        printed: list[str] = []
        register_print_hook(printed.append, printer="weighbridge")

        result = print_text("slip text", printer="weighbridge")

        self.assertTrue(result)
        self.assertEqual(printed, ["slip text"])

    def test_print_text_without_hook_reports_unavailable(self) -> None:
        self.assertFalse(print_text("slip text"))

    def test_print_text_accepts_explicit_hook(self) -> None:
        printed: list[str] = []

        self.assertTrue(print_text("slip text", hook=printed.append))
        self.assertEqual(printed, ["slip text"])


if __name__ == "__main__":
    unittest.main()
