import React from "react";
import { Document as DocxDocument, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { Document, Link, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { exportableCV, type TailoredCV } from "@cv-maker/shared";

const saveBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const styles = StyleSheet.create({
  page: { padding: 42, fontFamily: "Helvetica", color: "#17201f", fontSize: 9.5, lineHeight: 1.42 },
  compact: { padding: 32, fontSize: 9 },
  name: { fontFamily: "Helvetica-Bold", fontSize: 24, color: "#163f3b", marginBottom: 3 },
  headline: { fontSize: 11, color: "#426460", marginBottom: 8 },
  contact: { flexDirection: "row", flexWrap: "wrap", gap: 8, color: "#4c5856", fontSize: 8, marginBottom: 14 },
  section: { marginTop: 10 },
  heading: { fontFamily: "Helvetica-Bold", fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", color: "#163f3b", borderBottomWidth: 0.6, borderBottomColor: "#aac0bc", paddingBottom: 3, marginBottom: 5 },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: "#5b6866" },
  bullet: { flexDirection: "row", marginTop: 2 },
  dot: { width: 10 },
  body: { flex: 1 },
  skills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});

const PDFResume = ({ cv }: { cv: TailoredCV }) => {
  const clean = exportableCV(cv);
  const compact = clean.templateId === "compact";
  const contact = [clean.contact.email, clean.contact.phone, clean.contact.location, clean.contact.linkedin, clean.contact.website].filter(Boolean);
  return (
    <Document title={`${clean.contact.fullName} CV`} author={clean.contact.fullName}>
      <Page size="A4" style={[styles.page, compact ? styles.compact : {}]}>
        <Text style={styles.name}>{clean.contact.fullName}</Text>
        {clean.contact.headline && <Text style={styles.headline}>{clean.contact.headline}</Text>}
        <View style={styles.contact}>{contact.map((item) => <Text key={item}>{item}</Text>)}</View>
        {clean.summary.visible && clean.summary.text && <View style={styles.section}><Text style={styles.heading}>Profile</Text><Text>{clean.summary.text}</Text></View>}
        {clean.experience.some((item) => item.visible) && <View style={styles.section}><Text style={styles.heading}>Experience</Text>{clean.experience.filter((item) => item.visible).map((item) => <View key={item.id} wrap={false}><View style={styles.row}><Text style={styles.bold}>{item.role} · {item.company}</Text><Text style={styles.muted}>{item.startDate}–{item.endDate}</Text></View>{item.bullets.filter((bullet) => bullet.visible).map((bullet) => <View style={styles.bullet} key={bullet.id}><Text style={styles.dot}>•</Text><Text style={styles.body}>{bullet.text}</Text></View>)}</View>)}</View>}
        {clean.skills.some((item) => item.visible) && <View style={styles.section}><Text style={styles.heading}>Skills</Text><View style={styles.skills}>{clean.skills.filter((item) => item.visible).map((item) => <Text key={item.id}>{item.text}</Text>)}</View></View>}
        {clean.education.some((item) => item.visible) && <View style={styles.section}><Text style={styles.heading}>Education</Text>{clean.education.filter((item) => item.visible).map((item) => <View key={item.id}><View style={styles.row}><Text style={styles.bold}>{item.qualification} · {item.institution}</Text><Text style={styles.muted}>{item.startDate}–{item.endDate}</Text></View>{item.details && <Text>{item.details}</Text>}</View>)}</View>}
        {clean.projects.some((item) => item.visible) && <View style={styles.section}><Text style={styles.heading}>Projects</Text>{clean.projects.filter((item) => item.visible).map((item) => <View key={item.id}><Text style={styles.bold}>{item.name}</Text><Text>{item.description}</Text>{item.link && <Link src={item.link}>{item.link}</Link>}</View>)}</View>}
      </Page>
    </Document>
  );
};

export const exportPDF = async (cv: TailoredCV) => saveBlob(await pdf(<PDFResume cv={cv} />).toBlob(), `${cv.contact.fullName || "CV"}.pdf`);

export const exportDOCX = async (cv: TailoredCV) => {
  const clean = exportableCV(cv);
  const heading = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 80 } });
  const children: Paragraph[] = [
    new Paragraph({ children: [new TextRun({ text: clean.contact.fullName, bold: true, size: 34, color: "163F3B" })] }),
    new Paragraph({ text: clean.contact.headline, spacing: { after: 80 } }),
    new Paragraph({ text: [clean.contact.email, clean.contact.phone, clean.contact.location, clean.contact.linkedin, clean.contact.website].filter(Boolean).join("  |  "), spacing: { after: 180 } }),
  ];
  if (clean.summary.visible && clean.summary.text) children.push(heading("PROFILE"), new Paragraph(clean.summary.text));
  if (clean.experience.some((item) => item.visible)) {
    children.push(heading("EXPERIENCE"));
    clean.experience.filter((item) => item.visible).forEach((item) => {
      children.push(new Paragraph({ children: [new TextRun({ text: `${item.role} · ${item.company}`, bold: true }), new TextRun({ text: `    ${item.startDate}–${item.endDate}`, color: "5B6866" })], spacing: { before: 100 } }));
      item.bullets.filter((bullet) => bullet.visible).forEach((bullet) => children.push(new Paragraph({ text: bullet.text, bullet: { level: 0 } })));
    });
  }
  if (clean.skills.some((item) => item.visible)) children.push(heading("SKILLS"), new Paragraph(clean.skills.filter((item) => item.visible).map((item) => item.text).join("  •  ")));
  if (clean.education.some((item) => item.visible)) {
    children.push(heading("EDUCATION"));
    clean.education.filter((item) => item.visible).forEach((item) => children.push(new Paragraph({ children: [new TextRun({ text: `${item.qualification} · ${item.institution}`, bold: true }), new TextRun({ text: `    ${item.startDate}–${item.endDate}` })] }), new Paragraph(item.details)));
  }
  const document = new DocxDocument({ sections: [{ properties: {}, children }] });
  saveBlob(await Packer.toBlob(document), `${clean.contact.fullName || "CV"}.docx`);
};
