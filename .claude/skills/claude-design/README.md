# claude-design

A `SKILL.md` for the **[open agent skills ecosystem](https://github.com/vercel-labs/skills)**
that turns your coding agent into an expert designer — animator, UX designer,
slide designer, prototyper — producing craft-level HTML/CSS/JS artefacts
instead of generic AI slop.

Use it for landing pages, decks, prototypes, interactive experiences, animated
videos, wireframes, and design explorations. Drop a Figma link or screenshot
and ask for a rebuild; ask for variations or tweaks; or just ask for a
polished, opinionated design.

## Install

Recommended — via the [`skills` CLI](https://github.com/vercel-labs/skills):

```bash
npx skills add fol2/claude-design
```

The CLI auto-detects whichever supported agent(s) you have installed (Claude
Code, Codex, Cursor, OpenCode, Gemini CLI, GitHub Copilot, and ~40 more) and
drops the skill into the correct per-agent directory.

### Common variants

```bash
# Global install (user-level), Claude Code only, no prompts
npx skills add fol2/claude-design -g -a claude-code -y

# List the skill without installing
npx skills add fol2/claude-design --list

# Project-local install (default, no -g)
npx skills add fol2/claude-design
```

### Update / remove

```bash
npx skills update claude-design
npx skills remove claude-design
```

### Manual install (no CLI)

If you'd rather skip the CLI, clone straight into your agent's skills
directory. For Claude Code:

```bash
# Global (available across all projects)
git clone https://github.com/fol2/claude-design.git ~/.claude/skills/claude-design

# Project-local
git clone https://github.com/fol2/claude-design.git .claude/skills/claude-design
```

## Repo layout

Single-skill repository — `SKILL.md` lives at the root and is auto-discovered
by the `skills` CLI:

```
claude-design/
├── SKILL.md   # frontmatter (name, description) + the design philosophy
└── README.md  # this file
```

## Attribution

The principles in `SKILL.md` are adapted from Anthropic's design-artefact
system prompt. Tool names and APIs have been generalised so the skill works
inside any host that follows the
[Agent Skills specification](https://agentskills.io) — Claude Code, Copilot
CLI, Gemini CLI, Cursor, Codex, OpenCode, and others.
