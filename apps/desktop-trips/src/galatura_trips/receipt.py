from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

PrintHook = Callable[[str], None]

_print_hooks: dict[str, PrintHook] = {}


@dataclass(frozen=True)
class WeighingSlip:
    reference: str
    trip_id: str
    supplier: str
    gross_kg: str
    tare_kg: str
    net_kg: str
    bags: str
    weighed_at: str
    scale_id: str = "MANUAL"
    grade: str = ""
    operator: str = ""


def register_print_hook(hook: PrintHook, printer: str = "default") -> None:
    _print_hooks[printer] = hook


def clear_print_hooks() -> None:
    _print_hooks.clear()


def print_text(text: str, printer: str | None = None, hook: PrintHook | None = None) -> bool:
    target = hook if hook is not None else _print_hooks.get(printer or "default")
    if target is None:
        return False
    target(text)
    return True


def render_receipt(slip: WeighingSlip) -> str:
    lines = [
        "GALATURA FACTORY - WEIGHING RECEIPT",
        "=" * 36,
        f"Reference: {slip.reference}",
        f"Trip: {slip.trip_id}",
        f"Supplier: {slip.supplier}",
        f"Weighed at: {slip.weighed_at}",
        f"Scale: {slip.scale_id}",
        "-" * 36,
        f"Gross: {slip.gross_kg} kg",
        f"Tare: {slip.tare_kg} kg",
        f"Net: {slip.net_kg} kg",
        f"Bags: {slip.bags}",
    ]
    if slip.grade:
        lines.append(f"Grade: {slip.grade}")
    if slip.operator:
        lines.append(f"Operator: {slip.operator}")
    lines.extend(["=" * 36, "Clerk copy"])
    return "\n".join(lines)


def render_label(slip: WeighingSlip) -> str:
    parts = [
        f"REF {slip.reference}",
        f"TRIP {slip.trip_id}",
        f"SUPPLIER {slip.supplier}",
        f"NET {slip.net_kg} KG",
        f"BAGS {slip.bags}",
        f"SCALE {slip.scale_id}",
    ]
    if slip.grade:
        parts.append(f"GRADE {slip.grade}")
    parts.append(slip.weighed_at[:10])
    return " | ".join(parts)
