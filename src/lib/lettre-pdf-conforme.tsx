import { Document, Font, Image, Page, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { QRCodeSVG as QRCode } from "qrcode.react";

// Police Times New Roman (serif officiel administration française)
Font.register({
  family: "TimesNewRoman",
  fonts: [
    { src: "https://cdn.jsdelivr.net/npm/@fontsource/times-new-roman@5.0.12/files/times-new-roman-latin-400-normal.woff", fontWeight: 400 },
    { src: "https://cdn.jsdelivr.net/npm/@fontsource/times-new-roman@5.0.12/files/times-new-roman-latin-700-normal.woff", fontWeight: 700 },
    { src: "https://cdn.jsdelivr.net/npm/@fontsource/times-new-roman@5.0.12/files/times-new-roman-latin-400-italic.woff", fontStyle: "italic", fontWeight: 400 },
  ],
});

const styles = StyleSheet.create({
  page: {
    paddingTop: 72,   // 2.5 cm
    paddingBottom: 72,
    paddingLeft: 72,
    paddingRight: 72,
    fontSize: 12,
    fontFamily: "TimesNewRoman",
    lineHeight: 1.8,
    color: "#1a1a1a",
  },
  // En-tête LRAR
  lrarHeader: {
    borderWidth: 2,
    borderColor: "#1a1a1a",
    borderStyle: "solid",
    padding: 12,
    marginBottom: 24,
    backgroundColor: "#fafafa",
  },
  lrarTitle: {
    fontSize: 14,
    fontWeight: 700,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  lrarNumber: {
    fontSize: 11,
    textAlign: "center",
    color: "#333",
  },
  // Blocs structurés
  block: {
    marginBottom: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    borderStyle: "solid",
    backgroundColor: "#fafafa",
  },
  blockTitle: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#444",
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
    paddingBottom: 4,
  },
  blockContent: {
    fontSize: 11,
    lineHeight: 1.6,
  },
  blockRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  blockLabel: {
    fontWeight: 700,
    width: 120,
    color: "#333",
  },
  blockValue: {
    flex: 1,
    color: "#333",
  },
  // Corps de lettre
  letterBody: {
    marginTop: 24,
    marginBottom: 24,
    textAlign: "justify",
    lineHeight: 1.8,
  },
  letterParagraph: {
    marginBottom: 14,
    textIndent: 24,
  },
  letterFirstParagraph: {
    marginBottom: 14,
    textIndent: 0,
  },
  // Signature
  signatureBlock: {
    marginTop: 48,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#ccc",
  },
  signatureLabel: {
    fontSize: 10,
    color: "#666",
    marginBottom: 12,
  },
  signature: {
    width: 200,
    height: 80,
    objectFit: "contain",
  },
  // Pièces jointes
  pjBlock: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#ccc",
  },
  pjTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 8,
  },
  pjItem: {
    fontSize: 10,
    lineHeight: 1.6,
    marginBottom: 3,
  },
  // QR Code
  qrBlock: {
    marginTop: 36,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#ccc",
    alignItems: "center",
  },
  qrTitle: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 8,
    color: "#444",
  },
  qrCode: {
    width: 80,
    height: 80,
  },
  qrCaption: {
    marginTop: 8,
    fontSize: 9,
    color: "#666",
    textAlign: "center",
  },
  // En-tête LRAR spécifique
  lrarBadge: {
    fontSize: 11,
    fontWeight: 700,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#c00",
    marginBottom: 8,
  },
});

// Types
export interface LettreData {
  // Identité
  nom: string;
  prenom?: string;
  adresse?: string;
  codePostal?: string;
  ville?: string;
  telephone?: string;
  email?: string;
  // Véhicule
  plaque: string;
  // PV
  numPv: string;
  datePv?: string;
  montant?: string;
  // Contestation
  texte: string;
  // Signature
  signatureDataUrl?: string | null;
  // Pièces jointes
  piecesJointes?: Array<{ numero: number; nom: string; description?: string }> | null;
  // QR Code
  qrToken?: string;
  // Métadonnées LRAR
  lrarNumero?: string;
  lrarDate?: string;
  // Destinataire
  destinataire?: {
    nom: string;
    adresse: string;
    codePostal: string;
    ville: string;
  };
  // Expéditeur
  expediteur?: {
    nom: string;
    prenom?: string;
    adresse: string;
    codePostal: string;
    ville: string;
    telephone?: string;
    email?: string;
  };
  // Type
  typeInfraction?: "AMENDE" | "SUSPENSION";
  canalEnvoi?: "ANTAI" | "TELERECOURS" | "LRAR";
}

/** Parse le texte brut en paragraphes (séparés par double saut de ligne) */
function parseParagraphs(texte: string): string[] {
  return texte
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Composant En-tête LRAR */
function EnTeteLRAR({ numero, date }: { numero?: string; date?: string }) {
  return (
    <View style={styles.lrarHeader}>
      <Text style={styles.lrarBadge}>RECOMMANDÉ AVEC ACCUSÉ DE RÉCEPTION</Text>
      <Text style={styles.lrarTitle}>RECOMMANDÉ AVEC ACCUSÉ DE RÉCEPTION</Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
        <Text style={styles.lrarNumber}>
          {numero ? `N° LRAR : ${numero}` : "N° LRAR : [AUTO]"}
        </Text>
        <Text style={styles.lrarNumber}>
          {date ? `Date : ${date}` : `Date : ${new Date().toLocaleDateString("fr-FR")}`}
        </Text>
      </View>
    </View>
  );
}

/** Bloc Destinataire / Expéditeur */
function BlocAdresse({
  titre,
  nom,
  prenom,
  adresse,
  codePostal,
  ville,
  telephone,
  email,
}: {
  titre: string;
  nom: string;
  prenom?: string;
  adresse?: string;
  codePostal?: string;
  ville?: string;
  telephone?: string;
  email?: string;
}) {
  const nomComplet = [prenom, nom].filter(Boolean).join(" ");
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{titre}</Text>
      <Text style={styles.blockContent}>{nomComplet.toUpperCase()}</Text>
      {adresse && (
        <Text style={styles.blockContent}>{adresse}</Text>
      )}
      {codePostal && ville && (
        <Text style={styles.blockContent}>{codePostal} {ville}</Text>
      )}
      {telephone && (
        <View style={styles.blockRow}>
          <Text style={styles.blockLabel}>Tél :</Text>
          <Text style={styles.blockValue}>{telephone}</Text>
        </View>
      )}
      {email && (
        <View style={styles.blockRow}>
          <Text style={styles.blockLabel}>Email :</Text>
          <Text style={styles.blockValue}>{email}</Text>
        </View>
      )}
    </View>
  );
}

/** Référence PV */
function ReferencePV({ numPv, plaque, montant, date }: { numPv: string; plaque: string; montant?: string; date?: string }) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>Référence du procès-verbal</Text>
      <View style={styles.blockRow}>
        <Text style={styles.blockLabel}>N° PV :</Text>
        <Text style={styles.blockValue}>{numPv}</Text>
      </View>
      <View style={styles.blockRow}>
        <Text style={styles.blockLabel}>Plaque :</Text>
        <Text style={styles.blockValue}>{plaque}</Text>
      </View>
      {montant && (
        <View style={styles.blockRow}>
          <Text style={styles.blockLabel}>Montant :</Text>
          <Text style={styles.blockValue}>{montant} €</Text>
        </View>
      )}
      {date && (
        <View style={styles.blockRow}>
          <Text style={styles.blockLabel}>Date :</Text>
          <Text style={styles.blockValue}>{date}</Text>
        </View>
      )}
    </View>
  );
}

/** Corps de lettre formaté */
function CorpsLettre({ texte }: { texte: string }) {
  const paragraphes = parseParagraphs(texte);
  return (
    <View style={styles.letterBody}>
      {paragraphes.map((para, idx) => (
        <Text key={idx} style={idx === 0 ? styles.letterFirstParagraph : styles.letterParagraph}>
          {para}
        </Text>
      ))}
    </View>
  );
}

/** Signature */
function SignatureBloc({ dataUrl }: { dataUrl?: string | null }) {
  return (
    <View style={styles.signatureBlock}>
      <Text style={styles.signatureLabel}>Signature du requérant :</Text>
      {dataUrl ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image src={dataUrl} style={styles.signature} />
      ) : (
        <Text style={{ fontSize: 9, color: "#999", fontStyle: "italic" }}>
          (Lettre non signée — signature apposée par le client après validation)
        </Text>
      )}
    </View>
  );
}

/** Pièces jointes */
function PiecesJointesBloc({ pieces }: { pieces?: Array<{ numero: number; nom: string; description?: string }> | null }) {
  if (!pieces || pieces.length === 0) return null;
  return (
    <View style={styles.pjBlock}>
      <Text style={styles.pjTitle}>PIÈCES JOINTES :</Text>
      {pieces.map((pj, idx) => (
        <Text key={`${pj.numero}-${idx}`} style={styles.pjItem}>
          PJ{pj.numero} — {pj.nom}{pj.description ? ` (${pj.description})` : ""}
        </Text>
      ))}
    </View>
  );
}

/** QR Code dépôt assisté */
function QRCodeDepot({ token }: { token?: string }) {
  if (!token) return null;
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://recours-permis-pv.com"}/recours/finaliser?token=${token}`;
  return (
    <View style={styles.qrBlock}>
      <Text style={styles.qrTitle}>DÉPÔT ASSISTÉ EN LIGNE</Text>
      <Svg width={80} height={80}>
        <QRCode value={url} size={80} level="M" includeMargin={true} />
      </Svg>
      <Text style={styles.qrCaption}>
        Scannez pour déposer votre contestation sur le portail officiel
      </Text>
    </View>
  );
}

export async function generateLettrePdf(data: LettreData): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");

  const now = new Date();
  const dateLettre = data.lrarDate ?? now.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const lrarNumero = data.lrarNumero ?? `LRAR-${now.getFullYear()}-${String(now.getTime()).slice(-6)}`;

  const element = (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* En-tête LRAR */}
        <EnTeteLRAR numero={lrarNumero} date={dateLettre} />

        {/* Destinataire */}
        {data.destinataire && (
          <BlocAdresse
            titre="DESTINATAIRE"
            nom={data.destinataire.nom}
            adresse={data.destinataire.adresse}
            codePostal={data.destinataire.codePostal}
            ville={data.destinataire.ville}
          />
        )}

        {/* Expéditeur */}
        {data.expediteur && (
          <BlocAdresse
            titre="EXPÉDITEUR"
            nom={data.expediteur.nom}
            prenom={data.expediteur.prenom}
            adresse={data.expediteur.adresse}
            codePostal={data.expediteur.codePostal}
            ville={data.expediteur.ville}
            telephone={data.expediteur.telephone}
            email={data.expediteur.email}
          />
        )}

        {/* Référence PV */}
        <ReferencePV
          numPv={data.numPv}
          plaque={data.plaque}
          montant={data.montant}
          date={data.datePv}
        />

        {/* Objet */}
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Objet</Text>
          <Text style={styles.blockContent}>
            CONTESTATION D'AMENDE — {data.typeInfraction === "SUSPENSION" ? "RECOURS SUSPENSION" : "REQUÊTE EN EXONÉRATION"}
          </Text>
        </View>

        {/* Lieu et date */}
        <View style={{ marginTop: 12, marginBottom: 12, textAlign: "right" }}>
          <Text style={{ fontSize: 12, lineHeight: 1.8 }}>
            {data.expediteur?.ville ?? "Paris"}, le {dateLettre}
          </Text>
        </View>

        {/* Corps de lettre */}
        <CorpsLettre texte={data.texte} />

        {/* Formule de politesse */}
        <View style={{ marginTop: 24, lineHeight: 1.8 }}>
          <Text style={{ marginBottom: 8 }}>Je vous prie d'agréer, Monsieur l'Officier du Ministère Public, l'expression de mes salutations distinguées.</Text>
        </View>

        {/* Lieu et date de signature */}
        <View style={{ marginTop: 24, textAlign: "left" }}>
          <Text>Fait à {data.expediteur?.ville ?? "Paris"}, le {dateLettre}</Text>
        </View>

        {/* Signature */}
        <SignatureBloc dataUrl={data.signatureDataUrl} />

        {/* Pièces jointes */}
        <PiecesJointesBloc pieces={data.piecesJointes} />

        {/* QR Code dépôt assisté */}
        <QRCodeDepot token={data.qrToken} />
      </Page>
    </Document>
  );

  return renderToBuffer(element);
}