# Use Campaign as a runtime authorization across Issue-owned Runs

Status: accepted

A Campaign is an explicit per-execution authorization over a fixed set of
approved implementation Issues. It coordinates the existing Issue-owned Runs
rather than becoming a Run, scheduler, permanent configuration mode, or YOLO
alias, preserving the invariant that each implementation Issue owns exactly one
execution Run. GitHub and Orca hold durable state; `/goal` and technical
permission controls remain optional runtime adapters.
