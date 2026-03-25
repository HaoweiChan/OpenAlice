#!/usr/bin/env python3
"""Add TW and US pre-market briefing cron jobs to the running OpenAlice instance."""

import json
import sys
import urllib.request


BASE = "http://localhost:3002/api/cron/jobs"

TW_PAYLOAD = """\
This is an automated pre-market briefing for the Taiwan Stock Exchange (TWSE).

## Instructions

1. First, use `getMarketClock` to check if the Taiwan market is trading today. If it is a holiday or the market is closed for a special reason, respond with a short message: "Taiwan market is not trading today ([reason if known])." and stop.

2. Use `getPortfolio` to fetch all currently held positions. These are the stocks to analyze in the Personal Portfolio section below.

3. Search the web for real-time market data to compile the briefing.

---

You are an expert financial analyst and quantitative researcher. Your task is to generate a daily pre-market briefing for the Taiwan Stock Exchange (TWSE). Please structure the report using the following sections and gather the most up-to-date information available from the web:

## 1. US Market Recap & Macro Context
Provide a summary of the US market performance from the immediately preceding trading session.
* Indices: Closing numbers and percentage changes for the S&P 500, Nasdaq, Dow Jones, and especially the Philadelphia Semiconductor Index (SOX).
* Key Drivers: Brief explanation of what drove the US market (e.g., tech rally, inflation data, geopolitical fears).
* ADR Performance: Mention the performance of key Taiwanese ADRs (TSMC, UMC, ASE).

## 2. Macroeconomic News (TW & US)
Highlight critical news that could impact today's trading.
* US: Fed rate expectations, CPI/PPI releases, bond yield movements, or major economic policy shifts.
* Taiwan: Central bank policy updates, export data releases, currency (USD/TWD) movements, or major industry supply chain news.

## 3. Notable TW Stocks & Sector Guidance
Identify 3-5 notable Taiwanese stocks or sectors with strong momentum or news catalysts for today's session.
* Stock/Sector: Name and Ticker.
* Topic/Catalyst: Why is it notable today? (e.g., AI server supply chain, CoWoS expansion, silicon photonics).
* Guidance & Target Prices: Summarize any recent institutional research reports, analyst upgrades/downgrades, and consensus target prices.

## 4. Personal Portfolio Update
Analyze each stock returned by `getPortfolio`. For each stock, provide:
* Fundamental: Brief note on recent revenue growth or margin changes.
* Technical: Current trend (e.g., above/below 10MA/20MA), RSI, and key support/resistance levels.
* Chip Analysis (籌碼面): Recent buying/selling trends from the Three Major Institutional Investors (Foreign Investors 外資, Investment Trusts 投信, Dealers 自營商).
* Earnings Call Alert: Explicitly flag if an earnings call or investor conference (法說會) is scheduled within the next 7 days.
* **Recommendation: Based on the above analysis, state whether to HOLD, SELL, or ADD for each position, with a brief rationale.**

Format the final output in clean Markdown. Keep the tone professional, objective, and highly data-driven."""

US_PAYLOAD = """\
This is an automated pre-market briefing for the US Stock Market.

## Instructions

1. First, use `getMarketClock` to check if the US market is trading today. If it is a holiday or the market is closed for a special reason, respond with a short message: "US market is not trading today ([reason if known])." and stop.

2. Use `getPortfolio` to fetch all currently held US stock positions. These are the stocks to analyze in the Personal Portfolio section below.

3. Search the web for real-time market data to compile the briefing.

---

You are an expert financial analyst and quantitative researcher. Your task is to generate a pre-market briefing for the US Stock Market today. Please structure the report using the following sections and gather the most up-to-date information available from the web:

## 1. Pre-Market Futures & Market Sentiment
Provide a snapshot of the current market setup heading into the open.
* Index Futures: Current levels and percentage changes for S&P 500 (ES), Nasdaq 100 (NQ), and Dow Jones (YM).
* Volatility & Yields: Current VIX level and the US 10-Year Treasury yield.
* Overnight Drivers: Brief explanation of what is driving pre-market sentiment (e.g., overnight earnings, global news, sector rotations).

## 2. US Macroeconomic Calendar & News
Highlight critical macroeconomic data or events scheduled for today.
* Economic Data: Any key releases today (e.g., CPI, Non-Farm Payrolls, PCE, PMI) and the consensus estimates versus previous numbers.
* Fed Speak/Policy: Any scheduled speeches by Federal Reserve officials or FOMC minute releases.

## 3. Notable US Movers & Tech Focus
Identify 3-5 notable US stocks seeing heavy pre-market volume or news catalysts, with a strong emphasis on technology, AI, and semiconductors.
* Stock: Name and Ticker.
* Catalyst: Why is it moving? (e.g., earnings beat/miss, product launch, M&A news).
* Analyst Action: Summarize any major analyst upgrades, downgrades, or adjusted target prices issued this morning.

## 4. Personal Portfolio Update
Analyze each US stock returned by `getPortfolio`. For each stock, provide:
* Fundamental: Any breaking company-specific news, SEC filings, or headline risks.
* Technical: Current pre-market price relative to key moving averages (e.g., 20MA, 50MA) and nearest support/resistance levels.
* Earnings Call Alert: Explicitly flag if an earnings call is scheduled within the next 7 days, specifying if it is pre-market (BMO) or after-hours (AMC).
* **Recommendation: Based on the above analysis, state whether to HOLD, SELL, or ADD for each position, with a brief rationale.**

Format the final output in clean Markdown. Keep the tone professional, objective, and highly data-driven."""


def api(method, path, data=None):
    url = f"http://localhost:3002/api/cron{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    if body:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def main():
    action = sys.argv[1] if len(sys.argv) > 1 else "add"

    if action == "add":
        existing = api("GET", "/jobs")
        names = {j["name"] for j in existing["jobs"]}

        if "TW Pre-Market Briefing" not in names:
            r = api("POST", "/jobs", {
                "name": "TW Pre-Market Briefing",
                "enabled": True,
                "schedule": {"kind": "cron", "cron": "0 8 * * 1-5"},
                "payload": TW_PAYLOAD,
                "channel": "telegram",
            })
            print(f"Added TW job: {r}")
        else:
            print("TW job already exists, skipping")

        if "US Pre-Market Briefing" not in names:
            r = api("POST", "/jobs", {
                "name": "US Pre-Market Briefing",
                "enabled": True,
                "schedule": {"kind": "cron", "cron": "0 21 * * 1-5"},
                "payload": US_PAYLOAD,
                "channel": "telegram",
            })
            print(f"Added US job: {r}")
        else:
            print("US job already exists, skipping")

    elif action == "list":
        result = api("GET", "/jobs")
        for j in result["jobs"]:
            sch = j["schedule"]
            sch_str = sch.get("cron") or sch.get("every") or sch.get("at", "?")
            print(f"  [{j['id']}] {j['name']:30s} schedule={sch_str:20s} enabled={j['enabled']}")

    elif action == "run-us":
        jobs = api("GET", "/jobs")["jobs"]
        us = next((j for j in jobs if j["name"] == "US Pre-Market Briefing"), None)
        if not us:
            print("US job not found! Run 'add' first.")
            sys.exit(1)
        r = api("POST", f"/jobs/{us['id']}/run")
        print(f"Triggered US briefing (id={us['id']}): {r}")

    elif action == "run-tw":
        jobs = api("GET", "/jobs")["jobs"]
        tw = next((j for j in jobs if j["name"] == "TW Pre-Market Briefing"), None)
        if not tw:
            print("TW job not found! Run 'add' first.")
            sys.exit(1)
        r = api("POST", f"/jobs/{tw['id']}/run")
        print(f"Triggered TW briefing (id={tw['id']}): {r}")

    else:
        print(f"Usage: {sys.argv[0]} [add|list|run-us|run-tw]")
        sys.exit(1)


if __name__ == "__main__":
    main()
