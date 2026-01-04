# sls-memory

**Procedural memory for error handling.**

AI agents encounter the same errors repeatedly across sessions but don't remember how they fixed them. sls-memory maintains a playbook of error patterns with known fixes, so when an agent hits `ECONNREFUSED :5432` for the third time, it immediately knows: check if PostgreSQL is running.

## The Problem

```
Agent Session 1: "Connection refused on port 5432"
  → Agent investigates for 10 minutes
  → Discovers PostgreSQL isn't running
  → Fixes it with systemctl start postgresql

Agent Session 47: "Connection refused on port 5432"
  → Agent investigates for 10 minutes (again)
  → Discovers PostgreSQL isn't running (again)
  → No memory of Session 1
```

## The Solution

```bash
$ slsm context "ECONNREFUSED 127.0.0.1:5432"

[!] slsm-001: PostgreSQL connection refused
    Category: database | Score: 100%
    Root causes:
      - PostgreSQL service not running
      - PostgreSQL not configured to accept connections
    Fixes:
      1. Check if PostgreSQL is running
         $ systemctl status postgresql
      2. Start PostgreSQL if stopped
         $ sudo systemctl start postgresql
    Feedback: 92% helpful (12 votes)
```

## Installation

```bash
# Install CLI
bun install
bun run build
npm link  # Makes 'slsm' available globally

# Install MCP server (for AI agent integration)
cd mcp-server
bun install
bun run build
```

## Usage

### CLI Commands

```bash
# Look up known fixes for an error
slsm context "ECONNREFUSED 127.0.0.1:5432"
slsm context "npm ERR! ERESOLVE" --json

# Find similar patterns
slsm similar "connection timeout"

# Add feedback on a pattern
slsm mark slsm-001 helpful
slsm mark slsm-002 harmful

# View playbook stats
slsm stats

# Manage playbook
slsm playbook list
slsm playbook export > backup.yaml
```

### MCP Server (for AI Agents)

Add to your Claude Code MCP config:

```json
{
  "mcpServers": {
    "sls-memory": {
      "command": "bun",
      "args": ["run", "/path/to/sls-memory/mcp-server/dist/index.js"]
    }
  }
}
```

Available tools:
- `slsm_context` - Get fixes for an error message
- `slsm_add_pattern` - Add a new error pattern to the playbook
- `slsm_feedback` - Record whether a suggestion was helpful

## Playbook Format

Patterns are stored in `~/.sls-memory/playbook.yaml`:

```yaml
patterns:
  - id: slsm-001
    fingerprint: connection-refused-postgres
    pattern: "ECONNREFUSED.*:5432"
    severity: high
    category: database
    title: PostgreSQL connection refused
    symptoms:
      - "ECONNREFUSED 127.0.0.1:5432"
      - "connect ECONNREFUSED ::1:5432"
    root_causes:
      - PostgreSQL service not running
      - Firewall blocking port 5432
    fixes:
      - step: Check if PostgreSQL is running
        command: "systemctl status postgresql"
      - step: Start PostgreSQL if stopped
        command: "sudo systemctl start postgresql"
    feedback:
      helpful: 12
      harmful: 0
```

## How It Works

1. **Pattern Matching**: When you query an error, slsm first tries regex matching against known patterns, then falls back to keyword-based similarity scoring.

2. **Feedback Loop**: Agents (or humans) can mark suggestions as helpful/harmful. Patterns with poor feedback ratios surface lower in results.

3. **Learning**: Use `slsm reflect` to analyze recent logs and extract new error patterns. Or add patterns manually via CLI or MCP.

## Companion Tool

sls-memory works alongside [sls](https://github.com/krasmussen37/sls) (System Log Search), which indexes and searches system logs. Together they form a complete log intelligence stack:

- **sls**: Find and search logs across your system
- **sls-memory**: Remember what errors mean and how to fix them

## License

MIT
