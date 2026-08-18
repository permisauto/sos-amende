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
  signatureDataUrl: string,
): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const element = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.body}>{texte}</Text>
        <View style={styles.signatureBlock}>
          <Text style={styles.signatureLabel}>Signature du requérant :</Text>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={signatureDataUrl} style={styles.signature} />
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(element);
}