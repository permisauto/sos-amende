import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 56,
    fontSize: 11,
    fontFamily: "Helvetica",
    lineHeight: 1.6,
    color: "#1a1a1a",
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 24,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  label: {
    color: "#666",
  },
  footer: {
    marginTop: 40,
    fontSize: 9,
    color: "#999",
  },
});

export type PreuveInfo = {
  numeroDepot: string;
  dateDepot: string;
  numPv: string;
  plaque?: string;
  type?: string;
  nom?: string;
};

export async function generatePreuvePdf(
  info: PreuveInfo,
): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const date = new Date(info.dateDepot).toLocaleString("fr-FR");
  const element = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>
          Accusé de dépôt — ANTAI (portail de simulation)
        </Text>
        <View style={styles.row}>
          <Text style={styles.label}>Numéro de dépôt</Text>
          <Text>{info.numeroDepot}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Date de dépôt</Text>
          <Text>{date}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Numéro de PV</Text>
          <Text>{info.numPv}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Plaque</Text>
          <Text>{info.plaque ?? "—"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Type</Text>
          <Text>{info.type ?? "—"}</Text>
        </View>
        {info.nom && (
          <View style={styles.row}>
            <Text style={styles.label}>Requérant</Text>
            <Text>{info.nom}</Text>
          </View>
        )}
        <Text style={styles.footer}>
          Document généré par la plateforme de simulation ANTAI (développement).
          Ne constitue pas un justificatif officiel.
        </Text>
      </Page>
    </Document>
  );
  return renderToBuffer(element);
}