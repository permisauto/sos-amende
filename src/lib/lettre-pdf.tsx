import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 56,
    fontSize: 11,
    fontFamily: "Helvetica",
    lineHeight: 1.6,
    color: "#1a1a1a",
  },
  body: {
    whiteSpace: "pre-wrap",
  },
  signatureBlock: {
    marginTop: 64,
  },
  pjBlock: {
    marginTop: 28,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e2e2e2",
  },
  pjTitle: {
    fontWeight: "bold",
    marginBottom: 6,
  },
  pjItem: {
    fontSize: 10,
    lineHeight: 1.5,
  },
  signatureLabel: {
    fontSize: 10,
    color: "#666",
    marginBottom: 8,
  },
  signature: {
    width: 180,
    height: 70,
    objectFit: "contain",
  },
});

export async function generateLettrePdf(
  texte: string,
  signatureDataUrl: string | null,
  piecesJointes?: string[] | null,
): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const element = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.body}>{texte}</Text>
        {piecesJointes && piecesJointes.length > 0 && (
          <View style={styles.pjBlock}>
            <Text style={styles.pjTitle}>
              Pièces jointes à l'appui de la contestation :
            </Text>
            {piecesJointes.map((pj, idx) => (
              <Text key={`${pj}-${idx}`} style={styles.pjItem}>
                — {pj}
              </Text>
            ))}
          </View>
        )}
        <View style={styles.signatureBlock}>
          <Text style={styles.signatureLabel}>Signature du requérant :</Text>
          {signatureDataUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={signatureDataUrl} style={styles.signature} />
          ) : (
            <Text style={{ fontSize: 9, color: "#999" }}>
              (lettre non signée — signature apposée par le client après validation)
            </Text>
          )}
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(element);
}