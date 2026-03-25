"""
Sinopac/Shioaji bridge — FastAPI sidecar for OpenAlice.
Wraps the Python-only Shioaji SDK and exposes REST + WebSocket endpoints
so the TypeScript SinopacBroker can interact with Taiwan markets.
"""

import os
import signal
import asyncio
import logging
from typing import Optional
from contextlib import asynccontextmanager

import shioaji as sj
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


from bar_aggregator import BarAggregatorManager

logger = logging.getLogger("sinopac-bridge")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")

api_instance: Optional[sj.Shioaji] = None
logged_in = False
# order_id -> Trade mapping for modify/cancel
trades: dict[str, sj.order.Trade] = {}
# WebSocket clients for streaming
ws_clients: set[WebSocket] = set()
# Per-client subscriptions: ws -> set of (code, quote_type)
ws_subscriptions: dict[WebSocket, set[tuple[str, str]]] = {}
# Per-client bar subscriptions: ws -> set of (code, timeframe)
ws_bar_subscriptions: dict[WebSocket, set[tuple[str, str]]] = {}


# ==================== Lifespan ====================

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    _shutdown()


def _shutdown():
    global api_instance, logged_in
    if api_instance and logged_in:
        try:
            api_instance.logout()
            logger.info("Shioaji logged out")
        except Exception as e:
            logger.warning("Logout error: %s", e)
    logged_in = False


def _handle_signal(signum, frame):
    logger.info("Received signal %s, shutting down", signum)
    _shutdown()
    raise SystemExit(0)


signal.signal(signal.SIGTERM, _handle_signal)
signal.signal(signal.SIGINT, _handle_signal)


# ==================== App ====================

app = FastAPI(title="Sinopac Bridge", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== Models ====================

class LoginRequest(BaseModel):
    api_key: str
    secret_key: str


class OrderRequest(BaseModel):
    contract_code: str
    security_type: str  # stocks, futures, options
    action: str  # Buy, Sell
    price: float = 0
    quantity: int = 1
    price_type: str = "LMT"
    order_type: str = "ROD"
    order_cond: str = "Cash"
    order_lot: str = "Common"
    octype: str = "Auto"
    daytrade_short: bool = False


class OrderUpdateRequest(BaseModel):
    price: Optional[float] = None
    quantity: Optional[int] = None


# ==================== Helpers ====================

def _require_login():
    if not api_instance or not logged_in:
        raise HTTPException(status_code=401, detail="Not logged in")


def _get_contract(security_type: str, code: str):
    """Resolve a Shioaji contract by type and code."""
    _require_login()
    try:
        if security_type == "stocks":
            return api_instance.Contracts.Stocks[code]
        elif security_type == "futures":
            return api_instance.Contracts.Futures[code]
        elif security_type == "options":
            return api_instance.Contracts.Options[code]
    except (KeyError, AttributeError):
        return None
    return None


def _contract_to_dict(c) -> dict:
    """Serialize a Shioaji contract to a JSON-safe dict."""
    d = {"code": getattr(c, "code", ""), "symbol": getattr(c, "symbol", ""), "name": getattr(c, "name", "")}
    if hasattr(c, "exchange"):
        d["exchange"] = c.exchange.value if hasattr(c.exchange, "value") else str(c.exchange)
    if hasattr(c, "category"):
        d["category"] = c.category
    if hasattr(c, "limit_up"):
        d["limit_up"] = c.limit_up
    if hasattr(c, "limit_down"):
        d["limit_down"] = c.limit_down
    if hasattr(c, "reference"):
        d["reference"] = c.reference
    if hasattr(c, "unit"):
        d["unit"] = c.unit
    if hasattr(c, "day_trade"):
        d["day_trade"] = c.day_trade.value if hasattr(c.day_trade, "value") else str(c.day_trade)
    if hasattr(c, "delivery_month"):
        d["delivery_month"] = c.delivery_month
    if hasattr(c, "delivery_date"):
        d["delivery_date"] = c.delivery_date
    if hasattr(c, "underlying_kind"):
        d["underlying_kind"] = c.underlying_kind
    if hasattr(c, "strike_price"):
        d["strike_price"] = c.strike_price
    if hasattr(c, "option_right"):
        d["option_right"] = c.option_right.value if hasattr(c.option_right, "value") else str(c.option_right)
    return d


def _trade_to_dict(t: sj.order.Trade) -> dict:
    """Serialize a Shioaji Trade to JSON-safe dict."""
    status = t.status
    order = t.order
    return {
        "order_id": order.id,
        "action": order.action.value if hasattr(order.action, "value") else str(order.action),
        "price": order.price,
        "quantity": order.quantity,
        "status": status.status.value if hasattr(status.status, "value") else str(status.status),
        "order_datetime": str(status.order_datetime) if status.order_datetime else None,
        "deals": [
            {"seq": d.seq, "price": d.price, "quantity": d.quantity, "ts": d.ts}
            for d in (status.deals or [])
        ],
        "contract": _contract_to_dict(t.contract),
    }


def _snapshot_to_dict(s) -> dict:
    return {
        "code": s.code,
        "exchange": s.exchange.value if hasattr(s.exchange, "value") else str(s.exchange),
        "open": s.open,
        "high": s.high,
        "low": s.low,
        "close": s.close,
        "volume": s.volume,
        "total_volume": s.total_volume,
        "amount": getattr(s, "amount", 0),
        "total_amount": getattr(s, "total_amount", 0),
        "buy_price": s.buy_price,
        "buy_volume": s.buy_volume,
        "sell_price": s.sell_price,
        "sell_volume": s.sell_volume,
        "change_price": getattr(s, "change_price", 0),
        "change_rate": getattr(s, "change_rate", 0),
        "ts": s.ts,
    }


def _account_to_dict(acc) -> dict:
    return {
        "account_type": acc.account_type.value if hasattr(acc.account_type, "value") else str(acc.account_type),
        "person_id": acc.person_id,
        "broker_id": acc.broker_id,
        "account_id": acc.account_id,
        "signed": getattr(acc, "signed", False),
        "username": getattr(acc, "username", ""),
    }


# ==================== Routes: Auth ====================

@app.get("/health")
async def health():
    return {"status": "ok", "logged_in": logged_in}


@app.post("/login")
async def login(req: LoginRequest):
    global api_instance, logged_in
    try:
        api_instance = sj.Shioaji()
        result = api_instance.login(
            api_key=req.api_key,
            secret_key=req.secret_key,
            contracts_timeout=10000,
        )
        logged_in = True
        accounts = [_account_to_dict(a) for a in result] if result else []
        _setup_quote_callback()
        logger.info("Login success, %d accounts", len(accounts))
        return {"ok": True, "accounts": accounts}
    except Exception as e:
        logged_in = False
        logger.error("Login failed: %s", e)
        raise HTTPException(status_code=401, detail=str(e))


# ==================== Routes: Contracts ====================

@app.get("/contracts/{security_type}/{code}")
async def get_contract(security_type: str, code: str):
    contract = _get_contract(security_type, code)
    if not contract:
        raise HTTPException(status_code=404, detail=f"Contract not found: {security_type}/{code}")
    return _contract_to_dict(contract)


@app.get("/contracts/search")
async def search_contracts(q: str = Query(..., min_length=1)):
    _require_login()
    results = []
    for sec_type, store_name in [("stocks", "Stocks"), ("futures", "Futures"), ("options", "Options")]:
        store = getattr(api_instance.Contracts, store_name, None)
        if not store:
            continue
        try:
            contract = store[q]
            if contract:
                d = _contract_to_dict(contract)
                d["security_type"] = sec_type
                results.append(d)
        except (KeyError, AttributeError):
            pass
        # Also try iteration for partial matches (limited to avoid perf issues)
        try:
            for exchange_group in store:
                for c in exchange_group:
                    if q.upper() in getattr(c, "code", "").upper() or q.upper() in getattr(c, "name", "").upper():
                        d = _contract_to_dict(c)
                        d["security_type"] = sec_type
                        results.append(d)
                        if len(results) >= 50:
                            return results
        except (TypeError, StopIteration):
            pass
    return results


# ==================== Routes: Orders ====================

@app.post("/orders")
async def place_order(req: OrderRequest):
    _require_login()
    contract = _get_contract(req.security_type, req.contract_code)
    if not contract:
        raise HTTPException(status_code=404, detail=f"Contract not found: {req.contract_code}")

    try:
        if req.security_type == "stocks":
            order = api_instance.Order(
                price=req.price,
                quantity=req.quantity,
                action=sj.constant.Action[req.action],
                price_type=sj.constant.StockPriceType[req.price_type],
                order_type=sj.constant.OrderType[req.order_type],
                order_lot=sj.constant.StockOrderLot[req.order_lot],
                order_cond=sj.constant.StockOrderCond[req.order_cond] if hasattr(sj.constant, "StockOrderCond") else None,
                daytrade_short=req.daytrade_short,
                account=api_instance.stock_account,
            )
        else:
            order = api_instance.Order(
                price=req.price,
                quantity=req.quantity,
                action=sj.constant.Action[req.action],
                price_type=sj.constant.FuturesPriceType[req.price_type],
                order_type=sj.constant.OrderType[req.order_type],
                octype=sj.constant.FuturesOCType[req.octype],
                account=api_instance.futopt_account,
            )

        trade = api_instance.place_order(contract, order)
        if trade and trade.order:
            trades[trade.order.id] = trade
        return _trade_to_dict(trade)
    except Exception as e:
        logger.error("Place order failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@app.put("/orders/{order_id}")
async def update_order(order_id: str, req: OrderUpdateRequest):
    _require_login()
    trade = trades.get(order_id)
    if not trade:
        raise HTTPException(status_code=404, detail=f"Trade not found: {order_id}")
    try:
        kwargs = {}
        if req.price is not None:
            kwargs["price"] = req.price
        if req.quantity is not None:
            kwargs["qty"] = req.quantity
        api_instance.update_order(trade=trade, **kwargs)
        return _trade_to_dict(trade)
    except Exception as e:
        logger.error("Update order failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/orders/{order_id}")
async def cancel_order(order_id: str):
    _require_login()
    trade = trades.get(order_id)
    if not trade:
        raise HTTPException(status_code=404, detail=f"Trade not found: {order_id}")
    try:
        api_instance.cancel_order(trade)
        return _trade_to_dict(trade)
    except Exception as e:
        logger.error("Cancel order failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/orders")
async def list_orders(account_type: str = Query("stock")):
    _require_login()
    try:
        account = api_instance.stock_account if account_type == "stock" else api_instance.futopt_account
        api_instance.update_status(account)
        # Return all tracked trades for the requested account type
        result = []
        for t in trades.values():
            result.append(_trade_to_dict(t))
        return result
    except Exception as e:
        logger.error("List orders failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Routes: Market Data ====================

@app.get("/snapshots")
async def get_snapshots(codes: str = Query(...), security_type: str = Query("stocks")):
    _require_login()
    code_list = [c.strip() for c in codes.split(",") if c.strip()]
    contracts = []
    for code in code_list:
        c = _get_contract(security_type, code)
        if c:
            contracts.append(c)
    if not contracts:
        return []
    try:
        snapshots = api_instance.snapshots(contracts)
        return [_snapshot_to_dict(s) for s in snapshots]
    except Exception as e:
        logger.error("Snapshots failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/kbars")
async def get_kbars(
    code: str = Query(...),
    security_type: str = Query("stocks"),
    start: str = Query(...),
    end: str = Query(...),
):
    _require_login()
    contract = _get_contract(security_type, code)
    if not contract:
        raise HTTPException(status_code=404, detail=f"Contract not found: {code}")
    try:
        kbars = api_instance.kbars(contract=contract, start=start, end=end)
        return {
            "ts": list(kbars.ts),
            "open": list(kbars.Open),
            "high": list(kbars.High),
            "low": list(kbars.Low),
            "close": list(kbars.Close),
            "volume": list(kbars.Volume),
        }
    except Exception as e:
        logger.error("Kbars failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ticks")
async def get_ticks(
    code: str = Query(...),
    security_type: str = Query("stocks"),
    date: str = Query(...),
):
    _require_login()
    contract = _get_contract(security_type, code)
    if not contract:
        raise HTTPException(status_code=404, detail=f"Contract not found: {code}")
    try:
        ticks = api_instance.ticks(contract=contract, date=date)
        return {
            "ts": list(ticks.ts),
            "close": list(ticks.close),
            "volume": list(ticks.volume),
            "bid_price": list(ticks.bid_price),
            "bid_volume": list(ticks.bid_volume),
            "ask_price": list(ticks.ask_price),
            "ask_volume": list(ticks.ask_volume),
            "tick_type": list(ticks.tick_type),
        }
    except Exception as e:
        logger.error("Ticks failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Routes: Accounts ====================

@app.get("/accounts")
async def list_accounts():
    _require_login()
    try:
        accounts = api_instance.list_accounts()
        return [_account_to_dict(a) for a in accounts]
    except Exception as e:
        logger.error("List accounts failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Routes: Positions & Balance ====================

@app.get("/positions")
async def list_positions(account_type: str = Query("stock")):
    _require_login()
    try:
        if account_type == "stock":
            if not api_instance.stock_account:
                return []
            if not getattr(api_instance.stock_account, "signed", False):
                return []
            positions = api_instance.list_positions(api_instance.stock_account)
        else:
            if not api_instance.futopt_account:
                return []
            if not getattr(api_instance.futopt_account, "signed", False):
                return []
            positions = api_instance.list_positions(api_instance.futopt_account, unit=sj.constant.Unit.Common)
        return [_position_to_dict(p) for p in positions]
    except Exception as e:
        logger.error("List positions failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/account-balance")
async def account_balance(account_type: str = Query("auto")):
    _require_login()
    try:
        # For futures accounts, use margin(); for stock, use account_balance()
        stock_signed = api_instance.stock_account and getattr(api_instance.stock_account, "signed", False)
        use_margin = (
            account_type == "futures"
            or (account_type == "auto" and not stock_signed)
        )
        futopt_signed = api_instance.futopt_account and getattr(api_instance.futopt_account, "signed", False)
        if use_margin and futopt_signed:
            m = api_instance.margin(api_instance.futopt_account)
            return {
                "acc_balance": getattr(m, "today_balance", 0),
                "available_balance": getattr(m, "available_margin", 0),
                "equity": getattr(m, "equity", 0),
                "equity_amount": getattr(m, "equity_amount", 0),
                "margin": getattr(m, "initial_margin", 0),
                "maintenance_margin": getattr(m, "maintenance_margin", 0),
                "unrealized_pnl": getattr(m, "future_open_position", 0) + getattr(m, "option_open_position", 0),
                "realized_pnl": getattr(m, "future_settle_profitloss", 0) + getattr(m, "option_settle_profitloss", 0),
                "yesterday_balance": getattr(m, "yesterday_balance", 0),
                "risk_indicator": getattr(m, "risk_indicator", 0),
            }
        elif stock_signed:
            bal = api_instance.account_balance()
            return {
                "acc_balance": getattr(bal, "acc_balance", 0),
                "available_balance": 0,
                "equity": getattr(bal, "acc_balance", 0),
                "equity_amount": 0,
                "margin": 0,
                "maintenance_margin": 0,
                "unrealized_pnl": 0,
                "realized_pnl": 0,
                "yesterday_balance": 0,
                "risk_indicator": 0,
            }
        else:
            return {
                "acc_balance": 0, "available_balance": 0, "equity": 0,
                "equity_amount": 0, "margin": 0, "maintenance_margin": 0,
                "unrealized_pnl": 0, "realized_pnl": 0,
                "yesterday_balance": 0, "risk_indicator": 0,
            }
    except Exception as e:
        logger.error("Account balance failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


def _position_to_dict(p) -> dict:
    return {
        "id": getattr(p, "id", ""),
        "code": getattr(p, "code", ""),
        "direction": getattr(p, "direction", ""),
        "quantity": getattr(p, "quantity", 0),
        "price": getattr(p, "price", 0),
        "last_price": getattr(p, "last_price", 0),
        "pnl": getattr(p, "pnl", 0),
    }


# ==================== WebSocket: Streaming ====================

def _on_bar_complete(code: str, timeframe: str, bar_dict: dict):
    """Called by BarAggregator when a bar closes. Broadcasts to subscribed WS clients."""
    try:
        loop = asyncio.get_event_loop()
        loop.call_soon_threadsafe(
            asyncio.ensure_future, _broadcast_bar(code, timeframe, bar_dict)
        )
    except RuntimeError:
        pass

bar_manager = BarAggregatorManager(_on_bar_complete)


async def _broadcast_bar(code: str, timeframe: str, bar_dict: dict):
    """Push a completed bar to WebSocket clients subscribed to this code+timeframe."""
    msg = {"topic": "bar", "timeframe": timeframe, "code": code, "data": bar_dict}
    dead = []
    for ws, subs in ws_bar_subscriptions.items():
        if (code, timeframe) in subs:
            try:
                await ws.send_json(msg)
            except Exception:
                dead.append(ws)
    for ws in dead:
        ws_clients.discard(ws)
        ws_subscriptions.pop(ws, None)
        ws_bar_subscriptions.pop(ws, None)


def _setup_quote_callback():
    """Wire the global Shioaji quote callback to broadcast to WebSocket clients and bar aggregator."""
    @api_instance.quote.on_quote
    def on_quote(topic: str, quote: dict):
        loop = asyncio.get_event_loop()
        loop.call_soon_threadsafe(asyncio.ensure_future, _broadcast_quote(topic, quote))
        # Feed ticks to bar aggregator
        if "Close" in quote and bar_manager.active_codes:
            code = quote.get("code", topic.split("/")[-1] if "/" in topic else topic)
            price = quote["Close"][-1] if isinstance(quote["Close"], list) else quote["Close"]
            vol = quote.get("Volume", [0])
            vol = vol[-1] if isinstance(vol, list) else vol
            ts = quote.get("Time", [0])
            ts_val = ts[-1] if isinstance(ts, list) else ts
            if isinstance(ts_val, str):
                import datetime
                ts_val = datetime.datetime.fromisoformat(ts_val).timestamp()
            elif ts_val > 1e15:
                ts_val = ts_val / 1e9
            elif ts_val > 1e12:
                ts_val = ts_val / 1e3
            bar_manager.on_tick(code, float(price), int(vol), float(ts_val))


async def _broadcast_quote(topic: str, quote: dict):
    """Send a quote event to all connected WebSocket clients."""
    if not ws_clients:
        return
    msg = {"topic": topic, "data": quote}
    dead = []
    for ws in ws_clients:
        try:
            await ws.send_json(msg)
        except Exception:
            dead.append(ws)
    for ws in dead:
        ws_clients.discard(ws)
        ws_subscriptions.pop(ws, None)
        ws_bar_subscriptions.pop(ws, None)


@app.websocket("/stream")
async def stream(ws: WebSocket):
    await ws.accept()
    ws_clients.add(ws)
    ws_subscriptions[ws] = set()
    ws_bar_subscriptions[ws] = set()
    logger.info("WebSocket client connected (%d total)", len(ws_clients))

    try:
        while True:
            data = await ws.receive_json()
            action = data.get("action")
            code = data.get("code", "")
            security_type = data.get("security_type", "stocks")
            quote_type = data.get("quote_type", "tick")
            timeframe = data.get("timeframe", "")

            if action == "subscribe":
                if quote_type == "bar":
                    if not timeframe:
                        await ws.send_json({"action": "error", "detail": "timeframe required for bar subscriptions"})
                        continue
                    # Bar subscriptions need underlying tick data
                    contract = _get_contract(security_type, code)
                    if contract:
                        created = bar_manager.subscribe(code, timeframe)
                        if created:
                            api_instance.quote.subscribe(contract, quote_type=sj.constant.QuoteType.Tick)
                        ws_bar_subscriptions[ws].add((code, timeframe))
                        await ws.send_json({"action": "subscribed", "code": code, "quote_type": "bar", "timeframe": timeframe})
                    else:
                        await ws.send_json({"action": "error", "detail": f"Contract not found: {code}"})
                else:
                    contract = _get_contract(security_type, code)
                    if contract:
                        qt = sj.constant.QuoteType.Tick if quote_type == "tick" else sj.constant.QuoteType.BidAsk
                        api_instance.quote.subscribe(contract, quote_type=qt)
                        ws_subscriptions[ws].add((code, quote_type))
                        await ws.send_json({"action": "subscribed", "code": code, "quote_type": quote_type})
                    else:
                        await ws.send_json({"action": "error", "detail": f"Contract not found: {code}"})

            elif action == "unsubscribe":
                if quote_type == "bar" and timeframe:
                    ws_bar_subscriptions[ws].discard((code, timeframe))
                    bar_manager.unsubscribe(code, timeframe)
                    await ws.send_json({"action": "unsubscribed", "code": code, "quote_type": "bar", "timeframe": timeframe})
                else:
                    contract = _get_contract(security_type, code)
                    if contract:
                        qt = sj.constant.QuoteType.Tick if quote_type == "tick" else sj.constant.QuoteType.BidAsk
                        api_instance.quote.unsubscribe(contract, quote_type=qt)
                        ws_subscriptions[ws].discard((code, quote_type))
                        await ws.send_json({"action": "unsubscribed", "code": code, "quote_type": quote_type})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning("WebSocket error: %s", e)
    finally:
        # Clean up bar subscriptions
        for code, tf in ws_bar_subscriptions.get(ws, set()):
            bar_manager.unsubscribe(code, tf)
        ws_clients.discard(ws)
        ws_subscriptions.pop(ws, None)
        ws_bar_subscriptions.pop(ws, None)
        logger.info("WebSocket client disconnected (%d remaining)", len(ws_clients))


# ==================== Entrypoint ====================

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("SINOPAC_BRIDGE_PORT", "8890"))
    uvicorn.run("server:app", host="0.0.0.0", port=port, log_level="info")
