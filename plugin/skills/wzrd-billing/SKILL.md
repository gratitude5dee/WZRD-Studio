---
name: wzrd-billing
description: Explain WZRD credit balances, catalog prices, per-token daily caps, and how to buy more credits. Use this when the user asks how many credits they have, what something costs, why a call was refused for credits or scope, or how to top up or upgrade their plan. Covers get_credits, list_models, create_checkout_session, and the -32001 / -32002 / -32003 error codes. Never changes a saved payment method.
---

# Credits and billing

Tools: `get_credits`, `list_models`, `create_checkout_session`. **All free** —
`create_checkout_session` only produces a URL; it never charges anything.

## Answering "how much will this cost?"

Prices come from the catalog, never from you. Use `list_models` for model prices
and the spending tool's own `dryRun: true` for the exact quote of a specific call.
If a model or operation has no verified catalog price, the tool refuses instead of
guessing — for example Seedance auto mode, which stays unavailable until its
catalog pricing is published. Relay the refusal; do not estimate.

## Answering "how many credits do I have?"

`get_credits` returns `available`, `total`, `used`, plus a `token` object with its
`name`, `scopes`, `dailyUsed`, `dailyCap` and `dailyResetsAt`. The daily cap is a
**per-token** guard rail: the wallet can be full while the token is capped.

## Topping up

`create_checkout_session { checkoutMode: "pack", packCode }` or
`{ checkoutMode: "subscription", planCode }` returns a Stripe checkout URL.
Give the user the URL and let them complete it in their browser. The plugin cannot
and must not add, change, or store a payment method, and it never buys credits on
the user's behalf without them completing checkout themselves. Requires the
`billing` scope.

## Error codes

| Code | Meaning | What to tell the user |
| --- | --- | --- |
| `-32001` | Token missing, invalid, expired, or revoked | Create a new token in Settings → Agent access. Do not retry — a revoked token never becomes valid again. |
| `-32002` | Token lacks the required scope | Name the scope from the message (e.g. `generate`) and point at Settings → Agent access. |
| `-32003` | Token daily credit cap hit, or the wallet balance is too low | Relay `{ used, cap, resetsAt }` or the `topUpUrl` from the error data and offer a smaller job. |
| `-32004` | Token rate limit — too many calls in the window | Back off once, then report the reset time. Never retry in a loop. |

## The one safety loop

Every spend, without exception: `get_credits` → iterate free in text →
`dryRun` preview → **explicit user confirmation of a specific credit number** →
spend once with an `idempotencyKey` → present results with
`https://<app>/project/<projectId>?tab=timeline`.
