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
  /** Organisme destinataire (ANTAI / Télérecours) — simule le portail. */
  organisme?: string;
  /** Noms des pièces jointes transmises avec la contestation. */
  preuves?: string[];
  /** Variant « lettre recommandée avec accusé de réception » (envoi LRAR par SOS Amende). */
  lrar?: boolean;
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
          {info.lrar
            ? "Accusé de dépôt — lettre recommandée avec accusé de réception (LRAR) envoyée par SOS Amende"
            : `Accusé de dépôt — ${info.organisme ?? "ANTAI"} (portail de simulation)`}
        </Text>
        <View style={styles.row}>
          <Text style={styles.label}>
            {info.lrar ? "Numéro de recommandé" : "Numéro de dépôt"}
          </Text>
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
        {info.preuves && info.preuves.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <Text style={{ fontSize: 12, fontWeight: "bold", marginBottom: 6 }}>
              Pièces jointes transmises
            </Text>
            {info.preuves.map((nom) => (
              <Text key={nom} style={styles.row}>
                — {nom}
              </Text>
            ))}
          </View>
        )}
        <Text style={styles.footer}>
          {info.lrar
            ? "Document généré par la plateforme SOS Amende (développement). Conservez le récépissé de dépôt La Poste et l'accusé de réception qui fera foi de la notification."
            : `Document généré par la plateforme de simulation ${info.organisme ?? "ANTAI"} (développement). Ne constitue pas un justificatif officiel.`}
        </Text>
      </Page>
    </Document>
  );
  return renderToBuffer(element);
}