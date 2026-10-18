-- Compteur d'appels Gemini par jour (quota du palier gratuit) : clé = date UTC
-- "YYYY-MM-DD". Borne les traitements de masse de la veille (extraction et
-- régénération des propositions) pour ne jamais dépasser le quota quotidien.
CREATE TABLE "GeminiUsage" (
    "jour" TEXT NOT NULL,
    "appels" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeminiUsage_pkey" PRIMARY KEY ("jour")
);
