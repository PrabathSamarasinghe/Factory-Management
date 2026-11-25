from __future__ import annotations

import unittest
from decimal import Decimal
from unittest.mock import patch

from galatura_trips.scale import (
    ScaleConfig,
    ScaleError,
    ScaleParseError,
    ScaleTimeoutError,
    ScaleUnavailableError,
    SerialTransport,
    load_scale_config,
    parse_weight,
    read_scale,
)


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        self.now += 0.01
        return self.now


class FakeSerial:
    def __init__(self, lines: list[bytes]) -> None:
        self.lines = list(lines)
        self.written: list[bytes] = []
        self.closed = False
        self.timeout = 0.0

    def readline(self) -> bytes:
        return self.lines.pop(0) if self.lines else b""

    def write(self, command: bytes) -> int:
        self.written.append(command)
        return len(command)

    def close(self) -> None:
        self.closed = True


class ScaleTests(unittest.TestCase):
    def test_parse_stable_and_unstable_continuous_lines(self) -> None:
        stable = parse_weight("ST,+00123.456 kg")
        unstable = parse_weight("US, 00123.456 kg")

        self.assertEqual(stable.weight_kg, Decimal("123.456"))
        self.assertEqual(stable.weight_text(), "123.456")
        self.assertTrue(stable.stable)
        self.assertFalse(unstable.stable)
        self.assertEqual(unstable.unit, "kg")

    def test_parse_units_and_decimal_separator(self) -> None:
        grams = parse_weight("ST 1234 g")
        pounds = parse_weight("ST,10.5 lb")
        comma = parse_weight("ST,12,5kg")

        self.assertEqual(grams.weight_text(), "1.234")
        self.assertAlmostEqual(float(pounds.weight_kg), 4.7627, places=4)
        self.assertEqual(comma.weight_text(), "12.500")

    def test_parse_rejects_invalid_values(self) -> None:
        for value in ("", "no weight here", "ST,-1 kg"):
            with self.subTest(value=value), self.assertRaises(ScaleParseError):
                parse_weight(value)

    def test_load_scale_config_from_env(self) -> None:
        config = load_scale_config(
            {
                "GALATURA_SCALE_MODE": "serial",
                "GALATURA_SCALE_PORT": "COM3",
                "GALATURA_SCALE_BAUD": "115200",
                "GALATURA_SCALE_PROTOCOL": "poll",
                "GALATURA_SCALE_TIMEOUT": "2.5",
                "GALATURA_SCALE_POLL_COMMAND": "W\r",
                "GALATURA_SCALE_SIMULATED_WEIGHT": "500.25",
                "GALATURA_SCALE_REQUIRE_STABLE": "false",
                "GALATURA_SCALE_ID": "SCALE-9",
            }
        )

        self.assertEqual(config.mode, "serial")
        self.assertEqual(config.port, "COM3")
        self.assertEqual(config.baud, 115200)
        self.assertEqual(config.protocol, "poll")
        self.assertEqual(config.timeout_s, 2.5)
        self.assertEqual(config.poll_command, "W\r")
        self.assertEqual(config.simulated_weight_kg, "500.25")
        self.assertFalse(config.require_stable)
        self.assertEqual(config.scale_id, "SCALE-9")

    def test_load_scale_config_rejects_invalid_values(self) -> None:
        for env in (
            {"GALATURA_SCALE_MODE": "bluetooth"},
            {"GALATURA_SCALE_PROTOCOL": "http"},
            {"GALATURA_SCALE_BAUD": "fast"},
            {"GALATURA_SCALE_TIMEOUT": "0"},
        ):
            with self.subTest(env=env), self.assertRaises(ScaleError):
                load_scale_config(env)

    def test_read_scale_uses_simulator(self) -> None:
        config = ScaleConfig(simulated_weight_kg="321.500", scale_id="SIM-7")

        reading = read_scale(config)

        self.assertEqual(reading.weight_text(), "321.500")
        self.assertTrue(reading.stable)

    def test_poll_protocol_sends_command(self) -> None:
        from galatura_trips.scale import SimulatorTransport

        transport = SimulatorTransport(lines=["  +00087.250 kg ", "ST,999 kg"])
        config = ScaleConfig(mode="serial", protocol="poll", poll_command="W\r")

        reading = read_scale(config, transport=transport)

        self.assertEqual(reading.weight_text(), "87.250")
        self.assertEqual(transport.commands, ["W\r"])

    def test_timeout_without_stable_reading(self) -> None:
        config = ScaleConfig(timeout_s=0.05)
        clock = FakeClock()

        with self.assertRaises(ScaleTimeoutError):
            read_scale(
                config,
                transport=_NoReadingTransport(),
                clock=clock,
                sleep=lambda _seconds: None,
            )

    def test_serial_transport_requires_pyserial(self) -> None:
        with patch("galatura_trips.scale.serial", None):
            with self.assertRaises(ScaleUnavailableError):
                SerialTransport(ScaleConfig(mode="serial"))

    def test_serial_transport_reads_without_hardware(self) -> None:
        fake = FakeSerial([b"ST,250.125 kg\r\n"])
        transport = SerialTransport(
            ScaleConfig(mode="serial", port="COM5", timeout_s=1),
            transport_factory=lambda **_kwargs: fake,
        )

        reading = read_scale(ScaleConfig(mode="serial", timeout_s=1), transport=transport)

        self.assertEqual(reading.weight_text(), "250.125")
        self.assertGreater(fake.timeout, 0)
        self.assertTrue(fake.closed)


class _NoReadingTransport:
    def __init__(self) -> None:
        self.closed = False

    def read_line(self, timeout_s: float) -> str:
        return "US, 12.5 kg"

    def write(self, command: str) -> None:
        return None

    def close(self) -> None:
        self.closed = True


if __name__ == "__main__":
    unittest.main()
