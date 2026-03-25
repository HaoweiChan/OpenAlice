"""
Bar aggregator — builds OHLCV bars from real-time tick events.

Each aggregator tracks a single symbol+timeframe. Bars close on timeframe
boundaries (e.g. 09:05:00 for 5m starting at 09:00:00). Completed bars
are pushed to registered callbacks.
"""

import time
import logging
from dataclasses import dataclass, field
from typing import Callable, Optional

logger = logging.getLogger("bar-aggregator")

TIMEFRAME_SECONDS = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
}


@dataclass
class Bar:
    timestamp: float = 0
    open: float = 0
    high: float = 0
    low: float = 0
    close: float = 0
    volume: int = 0
    tick_count: int = 0

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp,
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume,
        }


BarCallback = Callable[[str, str, dict], None]  # (code, timeframe, bar_dict)


class BarAggregator:
    """Aggregates ticks into OHLCV bars for a single symbol+timeframe."""

    def __init__(self, code: str, timeframe: str, callback: BarCallback):
        if timeframe not in TIMEFRAME_SECONDS:
            raise ValueError(f"Unsupported timeframe: {timeframe}")
        self.code = code
        self.timeframe = timeframe
        self.interval = TIMEFRAME_SECONDS[timeframe]
        self.callback = callback
        self._current_bar: Optional[Bar] = None
        self._bar_end_ts: float = 0

    def _bar_boundary(self, tick_ts: float) -> float:
        """Return the close timestamp for the bar containing tick_ts."""
        return (tick_ts // self.interval + 1) * self.interval

    def on_tick(self, price: float, volume: int, tick_ts: float):
        """Feed a tick into the aggregator. Emits a bar if the timeframe boundary is crossed."""
        bar_end = self._bar_boundary(tick_ts)

        if self._current_bar is None or bar_end != self._bar_end_ts:
            if self._current_bar is not None and self._current_bar.tick_count > 0:
                self.callback(self.code, self.timeframe, self._current_bar.to_dict())
            bar_start = (tick_ts // self.interval) * self.interval
            self._current_bar = Bar(
                timestamp=bar_start,
                open=price,
                high=price,
                low=price,
                close=price,
                volume=volume,
                tick_count=1,
            )
            self._bar_end_ts = bar_end
        else:
            bar = self._current_bar
            bar.high = max(bar.high, price)
            bar.low = min(bar.low, price)
            bar.close = price
            bar.volume += volume
            bar.tick_count += 1

    def flush(self) -> Optional[dict]:
        """Force-emit the current partial bar (e.g. on session close)."""
        if self._current_bar and self._current_bar.tick_count > 0:
            bar_dict = self._current_bar.to_dict()
            self._current_bar = None
            self._bar_end_ts = 0
            return bar_dict
        return None


class BarAggregatorManager:
    """Manages multiple BarAggregator instances. Creates on subscribe, destroys on last unsubscribe."""

    def __init__(self, bar_callback: BarCallback):
        self._bar_callback = bar_callback
        self._aggregators: dict[tuple[str, str], BarAggregator] = {}
        self._ref_counts: dict[tuple[str, str], int] = {}

    def subscribe(self, code: str, timeframe: str) -> bool:
        """Add a subscriber for code+timeframe. Returns True if a new aggregator was created."""
        key = (code, timeframe)
        if key in self._ref_counts:
            self._ref_counts[key] += 1
            return False
        self._aggregators[key] = BarAggregator(code, timeframe, self._bar_callback)
        self._ref_counts[key] = 1
        logger.info("Bar aggregator created: %s %s", code, timeframe)
        return True

    def unsubscribe(self, code: str, timeframe: str) -> bool:
        """Remove a subscriber. Returns True if the aggregator was destroyed (last subscriber)."""
        key = (code, timeframe)
        if key not in self._ref_counts:
            return False
        self._ref_counts[key] -= 1
        if self._ref_counts[key] <= 0:
            agg = self._aggregators.pop(key, None)
            if agg:
                agg.flush()
            del self._ref_counts[key]
            logger.info("Bar aggregator destroyed: %s %s", code, timeframe)
            return True
        return False

    def on_tick(self, code: str, price: float, volume: int, tick_ts: float):
        """Feed a tick to all aggregators for this code (across all timeframes)."""
        for (c, tf), agg in self._aggregators.items():
            if c == code:
                agg.on_tick(price, volume, tick_ts)

    @property
    def active_codes(self) -> set[str]:
        return {code for code, _ in self._aggregators}

    @property
    def active_keys(self) -> set[tuple[str, str]]:
        return set(self._aggregators.keys())
