# Model and effort routing

Routing is a runtime decision owned by the coordinator and recorded in Orca.
It never appears in an Issue body, ticket, or Task contract. The names below
are the current defaults for this host; when the harness or model catalog
changes, update this file only. `AGENTS.md` and the skills do not name models.

## Role defaults

| Role | Use when | Default model / effort |
| --- | --- | --- |
| Coordinator | Conversation, contracts, gates, integration | GPT-5.6 Sol / high |
| Explorer | Bounded, mostly read-only investigation | GPT-5.6 Luna / high |
| Implementer | Clear, bounded, already-decided contract | GPT-5.6 Luna / high |
| Difficult implementer | Technically hard but decided work | GPT-5.6 Luna / xhigh; `max` only with a recorded reason |
| Judgment worker | Local choices required inside a contract | GPT-5.6 Terra / high |
| Architect | System-level design, contract, or migration choices | GPT-5.6 Sol / xhigh |
| Independent reviewer | Fresh read-only review of a risk-selected candidate | Terra / high for medium risk; Sol / high for high risk |

## Rules

- Route by uncertainty and blast radius, never by line count.
- Escalation ladder: `Luna → Terra → Sol`. Escalate only when the current role
  cannot decide safely; a worker escalates instead of changing architecture,
  public interfaces, persistent contracts, security assumptions, or
  requirements on its own.
- Do not use `xhigh` or `max` by default. Record the difficulty that warrants it.
- Campaign membership never raises model effort or review requirements.
- Record the chosen model and effort in the Run transition record
  (`docs/agents/orca-execution.md`), not in GitHub.
