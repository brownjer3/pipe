// Create constraints for unique IDs
CREATE CONSTRAINT context_id_unique IF NOT EXISTS
FOR (c:Context) REQUIRE c.id IS UNIQUE;

CREATE CONSTRAINT user_id_unique IF NOT EXISTS
FOR (u:User) REQUIRE u.id IS UNIQUE;

CREATE CONSTRAINT team_id_unique IF NOT EXISTS
FOR (t:Team) REQUIRE t.id IS UNIQUE;

// Create indexes for common queries
CREATE INDEX context_team_platform IF NOT EXISTS
FOR (c:Context) ON (c.teamId, c.platform);

CREATE INDEX context_team_type IF NOT EXISTS
FOR (c:Context) ON (c.teamId, c.type);

CREATE INDEX context_external_id IF NOT EXISTS
FOR (c:Context) ON (c.externalId);

CREATE INDEX context_updated IF NOT EXISTS
FOR (c:Context) ON (c.updatedAt);

// Create full-text search index
CREATE FULLTEXT INDEX context_search IF NOT EXISTS
FOR (c:Context) ON EACH [c.title, c.content];

// Initialize root nodes for teams (example)
// These will be created programmatically when teams are created