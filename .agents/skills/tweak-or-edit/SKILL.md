---
name: tweak-or-edit
description: 'Decide whether to use a tweak or a direct edit, then write the tweak or apply the change. Use when: choosing between experimentation vs direct change, writing tweaks, deciding how to handle a design or code change request, exploring variants vs committing to a single outcome.'
argument-hint: 'Describe the change you want to make'
---

# Tweak or Direct Edit

## Step 1 — Decide: Tweak or direct edit?

Not every request needs a tweak. Choose the right approach:

| Situation | Approach |
|-----------|----------|
| The user wants to **compare options** (wording, variant, color, layout) | **Tweak** — creates a live knob for side-by-side exploration |
| The user wants to **try multiple values** before committing | **Tweak** — supports reset and replay |
| The decision is already clear and there's only **one right answer** | **Direct edit** — modify the file immediately, no tweak needed |
| The change is a **bug fix** or **structural refactor** | **Direct edit** — tweaks are for design experimentation, not code correctness |
| The request says "please fix X" with no alternatives | **Direct edit** |
| The request says "try X, Y, Z variants" or "feels off" / "explore" | **Tweak** |

**When in doubt:** if the user will want to see options side-by-side in the browser, use a tweak. If there's a single clear outcome, edit directly.

---

## Step 2 — Writing a tweak

For the full tweak API, knob types, regex rules, and HMR behaviour, use the skill:

> **`.agents/skills/write-tweaks.md`**

Key rules at a glance:
- Always read the target file first before writing a regex
- Each `replaceInFile` must match exactly one location
- Write your regex against the **original** source (the replay model restores it before each run)
- Target source files (e.g. components, stylesheets) over generated or compiled output to avoid full-page reloads

Tweaks live in `tweaks/scripts/` and are gitignored — they are local, experimental, and disposable.
