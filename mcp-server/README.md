# SLSM MCP Server

MCP (Model Context Protocol) server wrapper for SLS Memory (SLSM) library.

## Tools

### slsm_context
Get known fixes for an error message.

**Parameters:**
- `error` (string, required): The error message or stack trace to analyze
- `limit` (number, optional): Maximum patterns to return (default: 5)

**Returns:** Matching patterns with fixes, root causes, and feedback scores.

### slsm_add_pattern
Add a new error pattern to the playbook.

**Parameters:**
- `title` (string, required): Human-readable title for the pattern
- `pattern` (string, required): Regex pattern to match error messages
- `category` (string, required): Category (e.g., 'database', 'network', 'filesystem')
- `severity` (enum, optional): 'low', 'medium', 'high' (default: 'medium')
- `symptoms` (array, optional): List of symptom strings
- `root_causes` (array, optional): Known root causes
- `fixes` (array, optional): Fix steps with optional commands

**Returns:** Confirmation with new pattern ID.

### slsm_feedback
Record feedback on a pattern suggestion.

**Parameters:**
- `id` (string, required): The pattern ID (e.g., 'slsm-001')
- `helpful` (boolean, required): Whether the suggestion was helpful

**Returns:** Updated feedback counts.

## Usage

### Build
```bash
bun install
bun run build
```

### Run
```bash
bun run start
```

### MCP Configuration
Add to Claude Code MCP settings:
```json
{
  "mcpServers": {
    "slsm": {
      "command": "bun",
      "args": ["run", "/path/to/sls-mcp-impl/dist/index.js"]
    }
  }
}
```

## Data Storage

Patterns are stored in `~/.sls-memory/playbook.yaml` (JSON format).
