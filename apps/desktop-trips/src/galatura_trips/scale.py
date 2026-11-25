from __future__ import annotations

import os
import re
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Protocol

try:
    import serial
except ImportError:
    serial = None


class ScaleError(RuntimeError):
    pass


class ScaleParseError(ScaleError):
    pass


class ScaleTimeoutError(ScaleError):
    pass


class ScaleUnavailableError(ScaleError):
    pass


class ScaleReadError(ScaleError):
    pass


@dataclass(frozen=True)
class ScaleConfig:
    mode: str = "simulator"
    port: str = "SIM"
    baud: int = 9600
    protocol: str = "continuous"
    timeout_s: float = 5.0
    poll_command: str = "P\r"
    simulated_weight_kg: str = "123.456"
    require_stable: bool = True
    scale_id: str = "SIM-1"


@dataclass(frozen=True)
class ScaleReading:
    weight_kg: Decimal
    raw: str
    stable: bool
    unit: str

    def weight_text(self) -> str:
        rounded = self.weight_kg.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
        return format(rounded, "f")


class ScaleTransport(Protocol):
    def read_line(self, timeout_s: float) -> str: ...

    def write(self, command: str) -> None: ...

    def close(self) -> None: ...


class SimulatorTransport:
    def __init__(self, lines: list[str] | None = None, weight_kg: str = "123.456") -> None:
        self.lines = list(lines or [])
        self.weight_kg = weight_kg
        self.commands: list[str] = []
        self.closed = False

    def read_line(self, timeout_s: float) -> str:
        if self.lines:
            return self.lines.pop(0)
        return f"ST,{self.weight_kg} kg"

    def write(self, command: str) -> None:
        self.commands.append(command)

    def close(self) -> None:
        self.closed = True


class SerialTransport:
    def __init__(
        self,
        config: ScaleConfig,
        transport_factory: Callable[..., Any] | None = None,
    ) -> None:
        factory = transport_factory
        if factory is None:
            if serial is None:
                raise ScaleUnavailableError(
                    "pyserial is not installed; install the scale extra or use simulator mode."
                )
            factory = serial.Serial
        try:
            self._serial = factory(
                port=config.port,
                baudrate=config.baud,
                timeout=config.timeout_s,
            )
        except Exception as exc:
            raise ScaleUnavailableError(
                f"Cannot open scale port {config.port}: {exc}"
            ) from exc

    def read_line(self, timeout_s: float) -> str:
        try:
            self._serial.timeout = timeout_s
            raw = self._serial.readline()
        except Exception as exc:
            raise ScaleReadError(f"Scale read failed: {exc}") from exc
        if not raw:
            raise ScaleTimeoutError("The scale did not respond before the timeout.")
        if isinstance(raw, bytes):
            return raw.decode("ascii", errors="replace").strip()
        return str(raw).strip()

    def write(self, command: str) -> None:
        try:
            self._serial.write(command.encode("ascii"))
        except Exception as exc:
            raise ScaleReadError(f"Scale write failed: {exc}") from exc

    def close(self) -> None:
        try:
            self._serial.close()
        except Exception:
            pass


_WEIGHT_RE = re.compile(
    r"(?P<sign>[+-]?)\s*(?P<number>\d+(?:[.,]\d{1,3})?)\s*(?P<unit>kg|lbs|lb|g)?",
    re.IGNORECASE,
)
_UNIT_FACTORS = {
    "KG": Decimal("1"),
    "G": Decimal("0.001"),
    "LB": Decimal("0.45359237"),
    "LBS": Decimal("0.45359237"),
}


def _env_text(source: Mapping[str, str], key: str, default: str) -> str:
    value = source.get(key)
    return str(value).strip(" \t") if value is not None else default


def load_scale_config(env: Mapping[str, str] | None = None) -> ScaleConfig:
    source = os.environ if env is None else env
    mode = _env_text(source, "GALATURA_SCALE_MODE", "simulator").lower()
    protocol = _env_text(source, "GALATURA_SCALE_PROTOCOL", "continuous").lower()
    if mode not in {"serial", "simulator"}:
        raise ScaleError("GALATURA_SCALE_MODE must be serial or simulator.")
    if protocol not in {"continuous", "poll"}:
        raise ScaleError("GALATURA_SCALE_PROTOCOL must be continuous or poll.")
    try:
        baud = int(_env_text(source, "GALATURA_SCALE_BAUD", "9600"))
        timeout_s = float(_env_text(source, "GALATURA_SCALE_TIMEOUT", "5"))
    except ValueError as exc:
        raise ScaleError("GALATURA_SCALE_BAUD and GALATURA_SCALE_TIMEOUT must be numbers.") from exc
    if baud <= 0 or timeout_s <= 0:
        raise ScaleError("GALATURA_SCALE_BAUD and GALATURA_SCALE_TIMEOUT must be positive.")
    require_stable_raw = _env_text(source, "GALATURA_SCALE_REQUIRE_STABLE", "true").lower()
    return ScaleConfig(
        mode=mode,
        port=_env_text(source, "GALATURA_SCALE_PORT", "COM1"),
        baud=baud,
        protocol=protocol,
        timeout_s=timeout_s,
        poll_command=_env_text(source, "GALATURA_SCALE_POLL_COMMAND", "P\r"),
        simulated_weight_kg=_env_text(source, "GALATURA_SCALE_SIMULATED_WEIGHT", "123.456"),
        require_stable=require_stable_raw in {"1", "true", "yes", "on"},
        scale_id=_env_text(source, "GALATURA_SCALE_ID", "SIM-1"),
    )


def parse_weight(raw: str) -> ScaleReading:
    text = str(raw or "").strip()
    if not text:
        raise ScaleParseError("The scale returned no data.")
    match = _WEIGHT_RE.search(text)
    if not match:
        raise ScaleParseError(f"Could not read a weight from: {text}")
    unit = (match.group("unit") or "kg").upper()
    try:
        number = Decimal(match.group("number").replace(",", "."))
    except InvalidOperation as exc:
        raise ScaleParseError(f"Could not read a weight from: {text}") from exc
    if match.group("sign") == "-":
        number = -number
    weight = number * _UNIT_FACTORS[unit]
    if weight < 0:
        raise ScaleParseError("The scale returned a negative weight.")
    status = set(re.findall(r"[A-Za-z]+", text.upper()))
    stable = not status.intersection({"US", "UNSTABLE"})
    return ScaleReading(weight_kg=weight, raw=text, stable=stable, unit=unit.lower())


def create_transport(config: ScaleConfig) -> ScaleTransport:
    if config.mode == "simulator":
        return SimulatorTransport(weight_kg=config.simulated_weight_kg)
    return SerialTransport(config)


def read_scale(
    config: ScaleConfig,
    transport: ScaleTransport | None = None,
    *,
    clock: Callable[[], float] = time.monotonic,
    sleep: Callable[[float], None] = time.sleep,
) -> ScaleReading:
    client = transport or create_transport(config)
    deadline = clock() + config.timeout_s
    try:
        while True:
            remaining = deadline - clock()
            if remaining <= 0:
                raise ScaleTimeoutError(
                    f"No stable weight was received within {config.timeout_s:g}s."
                )
            if config.protocol == "poll":
                client.write(config.poll_command)
            raw = client.read_line(remaining)
            try:
                reading = parse_weight(raw)
            except ScaleParseError:
                sleep(0.01)
                continue
            if config.require_stable and not reading.stable:
                sleep(0.01)
                continue
            return reading
    except (ScaleError, ScaleTimeoutError):
        raise
    except Exception as exc:
        raise ScaleReadError(f"Scale read failed: {exc}") from exc
    finally:
        try:
            client.close()
        except Exception:
            pass
