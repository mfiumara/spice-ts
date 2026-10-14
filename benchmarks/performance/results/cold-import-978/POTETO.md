# #978 measurement plan and ownership stop

Scope: built core cold import, not simulation hot-path changes.
Data: 15 rounds of rotated control / CPU-profile / module-evaluation child runs;
rows contain mode, importMs, wallMs, host load and profile or module timing data.
Use the existing #960 RC1k harness for unchanged-deck/hash baseline evidence.
No new dependencies, netlist changes, tolerances, device registration or parser edits.

The build bundles source modules into shared chunks. CPU sampling can identify
V8 compilation of the whole bundle but cannot assign it to individual source
modules. Source-comment boundary timers on a separate diagnostic copy measure
module top-level evaluation only. Do not equate evaluation with total import cost.
Stop if the largest measured source-module initialization belongs to another lane.

Result: parser/tokenizer.ts is the largest measured initialization contributor.
The card's explicit ownership stop applies. Publish the receipt, leave #978 open,
and let the supervisor decide the follow-up. No optimization or before/after
speedup is claimed by this slice.
