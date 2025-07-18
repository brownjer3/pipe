-- CreateTable
CREATE TABLE "context_nodes" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "context_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_relationships" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "context_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "context_nodes_teamId_platform_idx" ON "context_nodes"("teamId", "platform");

-- CreateIndex
CREATE INDEX "context_nodes_type_idx" ON "context_nodes"("type");

-- CreateIndex
CREATE UNIQUE INDEX "context_nodes_platform_externalId_key" ON "context_nodes"("platform", "externalId");

-- CreateIndex
CREATE INDEX "context_relationships_sourceId_idx" ON "context_relationships"("sourceId");

-- CreateIndex
CREATE INDEX "context_relationships_targetId_idx" ON "context_relationships"("targetId");

-- CreateIndex
CREATE INDEX "context_relationships_relationshipType_idx" ON "context_relationships"("relationshipType");

-- AddForeignKey
ALTER TABLE "context_nodes" ADD CONSTRAINT "context_nodes_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_relationships" ADD CONSTRAINT "context_relationships_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "context_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_relationships" ADD CONSTRAINT "context_relationships_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "context_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
