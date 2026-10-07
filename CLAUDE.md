# CLAUDE.md

## Talking to the user: be explicit about numbered references

The user returns to this project after pauses, sometimes several days, and
does not remember what a number refers to. Whenever you mention a design
decision (`#27`), an open question (`#17`) or any other numbered item in chat
or in a commit message, include a short description of what it is on first
mention in that message, for example "decision #27 (the pantry model with
lots and expiry dates)" or "open question #17 (package sizes when buying,
currently deferred)".

- A bare number is never enough, even if it was explained earlier in the
  conversation.
- Keep the description to a few words. Do not restate the whole decision.
- Prefer the description alone when the number adds nothing.
- This applies to your messages to the user, not to the design docs, where
  numbers are defined in place.
