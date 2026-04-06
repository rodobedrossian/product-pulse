-- MCP Access Tokens
-- Long-lived tokens for authenticating MCP clients (Claude Desktop, Cursor, etc.)
-- Raw tokens are never stored — only a SHA-256 hash.

CREATE TABLE mcp_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name         TEXT,
  token_hash   TEXT        NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked      BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX mcp_tokens_team_id_idx    ON mcp_tokens(team_id);
CREATE INDEX mcp_tokens_token_hash_idx ON mcp_tokens(token_hash);
