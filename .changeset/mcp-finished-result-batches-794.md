---
"@spice-ts/mcp": patch
---

Stream jobs that are not forwarded live (OP/DC analyses, mixed analyses, `spice-ts` JSON input, or an injected `simulate`) no longer fail with `RESOURCE_LIMIT` (`maxUnreadEvents`/`maxUnreadBytes`) when the finished result has more than 256 events. The finished result, already bounded by `maxResultPoints`/`maxSerializedResultBytes`, is now converted to events lazily and released in cap-sized batches as reads drain the unread window, the same backpressure live jobs get. Cursor replay is unchanged, and an event that alone exceeds the unread caps still fails the job (#794).
