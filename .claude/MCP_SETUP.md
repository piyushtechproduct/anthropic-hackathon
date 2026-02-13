# MCP Server Setup Instructions

These commands need to be run **outside** of Claude Code session.

## 1. Filesystem MCP Server

```bash
claude mcp add --transport stdio filesystem -- npx -y @modelcontextprotocol/server-filesystem /Users/nurul.amin/Desktop/claude/hackathon/eAICOM/anthropic-hackathon
```

This provides Claude Code with scoped file operations for this project.

## 2. Commerce Agent MCP Server (Added later in Step 4-5)

```bash
claude mcp add --transport stdio commerce-agent -- uv run --directory /Users/nurul.amin/Desktop/claude/hackathon/eAICOM/anthropic-hackathon/backend python mcp_server.py
```

This exposes intent extraction as Claude Code tools.

## 3. Playwright MCP Server (For browser testing in Step 4-5)

```bash
claude mcp add --transport stdio playwright -- npx @anthropic/mcp-playwright@latest
```

This enables browser automation for the `/test-flow` skill.

## Verify MCP Servers

```bash
claude mcp list
```

Should show: filesystem, commerce-agent, playwright (after all are added)
