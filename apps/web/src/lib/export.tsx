import React, { type ReactNode } from "react";
import { Document as DocxDocument, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } from "docx";
import { Document, Image, Link, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import {
  calculateExperienceMonths, exportableCV, formatExperienceDate, formatExperienceDuration,
  type TailoredCV,
} from "@cv-maker/shared";
import { cropProfilePhoto } from "./photo";

const saveBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const styles = StyleSheet.create({
  page: { padding: 42, fontFamily: "Helvetica", color: "#1f2927", fontSize: 9.5, lineHeight: 1.45 },
  compact: { padding: 32, fontSize: 8.8, lineHeight: 1.36 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 22 },
  identity: { flexGrow: 1, flexShrink: 1 },
  photo: { width: 74, height: 74, objectFit: "cover", borderRadius: 6 },
  name: { fontFamily: "Helvetica-Bold", fontSize: 25, color: "#163f3b", marginBottom: 3 },
  headline: { fontSize: 11, color: "#426460", marginBottom: 8 },
  contact: { flexDirection: "row", flexWrap: "wrap", gap: 8, color: "#4c5856", fontSize: 8 },
  experienceTotal: { marginTop: 6, color: "#356c65", fontSize: 8, fontFamily: "Helvetica-Bold" },
  rule: { height: 2, backgroundColor: "#163f3b", marginTop: 13, marginBottom: 4 },
  section: { marginTop: 11 },
  heading: { fontFamily: "Helvetica-Bold", fontSize: 9, letterSpacing: 1.25, textTransform: "uppercase", color: "#163f3b", borderBottomWidth: 0.6, borderBottomColor: "#aac0bc", paddingBottom: 3, marginBottom: 6 },
  entry: { marginBottom: 5 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginTop: 2 },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: "#5b6866", fontSize: 8.3 },
  bullet: { flexDirection: "row", marginTop: 2 },
  dot: { width: 10 },
  body: { flex: 1 },
  skills: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  skill: { borderWidth: 0.5, borderColor: "#bfd0cc", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  listRow: { flexDirection: "row", gap: 5, marginBottom: 2 },
  link: { color: "#356c65", fontSize: 8.2, marginTop: 2 },
});

const dateRange = (start: string, end: string) => [formatExperienceDate(start, "start"), formatExperienceDate(end, "end")].filter(Boolean).join(" – ");

const PDFSection = ({ cv, sectionKey }: { cv: TailoredCV; sectionKey: string }): ReactNode => {
  if (sectionKey === "summary" && cv.summary.visible && cv.summary.text) return <View style={styles.section}><Text style={styles.heading}>Profile</Text><Text>{cv.summary.text}</Text></View>;
  if (sectionKey === "experience" && cv.experience.some((item) => item.visible)) return <View style={styles.section}><Text style={styles.heading}>Experience</Text>{cv.experience.filter((item) => item.visible).map((item) => <View key={item.id} style={styles.entry} wrap={false}><View style={styles.row}><View><Text style={styles.bold}>{item.role}</Text><Text style={styles.muted}>{item.company}{item.location ? ` · ${item.location}` : ""}</Text></View><Text style={styles.muted}>{dateRange(item.startDate, item.endDate)}</Text></View>{item.bullets.filter((bullet) => bullet.visible && bullet.text).map((bullet) => <View style={styles.bullet} key={bullet.id}><Text style={styles.dot}>•</Text><Text style={styles.body}>{bullet.text}</Text></View>)}</View>)}</View>;
  if (sectionKey === "skills" && cv.skills.some((item) => item.visible && item.text)) return <View style={styles.section}><Text style={styles.heading}>Core skills</Text><View style={styles.skills}>{cv.skills.filter((item) => item.visible && item.text).map((item) => <Text style={styles.skill} key={item.id}>{item.text}</Text>)}</View></View>;
  if (sectionKey === "education" && cv.education.some((item) => item.visible)) return <View style={styles.section}><Text style={styles.heading}>Education</Text>{cv.education.filter((item) => item.visible).map((item) => <View key={item.id} style={styles.entry} wrap={false}><View style={styles.row}><View><Text style={styles.bold}>{item.qualification}</Text><Text style={styles.muted}>{item.institution}</Text></View><Text style={styles.muted}>{dateRange(item.startDate, item.endDate)}</Text></View>{item.details && <Text>{item.details}</Text>}</View>)}</View>;
  if (sectionKey === "projects" && cv.projects.some((item) => item.visible)) return <View style={styles.section}><Text style={styles.heading}>Selected projects</Text>{cv.projects.filter((item) => item.visible).map((item) => <View key={item.id} style={styles.entry} wrap={false}><Text style={styles.bold}>{item.name}</Text>{item.description && <Text>{item.description}</Text>}{item.link && <Link style={styles.link} src={item.link}>{item.link}</Link>}</View>)}</View>;
  if (sectionKey === "certifications" && cv.certifications.some((item) => item.visible)) return <View style={styles.section}><Text style={styles.heading}>Certifications</Text>{cv.certifications.filter((item) => item.visible).map((item) => <View style={styles.listRow} key={item.id}><Text style={styles.bold}>{item.name}</Text>{item.detail && <Text style={styles.muted}>· {item.detail}</Text>}</View>)}</View>;
  if (sectionKey === "languages" && cv.languages.some((item) => item.visible)) return <View style={styles.section}><Text style={styles.heading}>Languages</Text>{cv.languages.filter((item) => item.visible).map((item) => <View style={styles.listRow} key={item.id}><Text style={styles.bold}>{item.name}</Text>{item.detail && <Text style={styles.muted}>· {item.detail}</Text>}</View>)}</View>;
  const custom = cv.customSections.find((item) => item.id === sectionKey);
  if (custom?.visible && custom.items.some((item) => item.visible && item.text)) return <View style={styles.section}><Text style={styles.heading}>{custom.title}</Text>{custom.items.filter((item) => item.visible && item.text).map((item) => <View style={styles.bullet} key={item.id}><Text style={styles.dot}>•</Text><Text style={styles.body}>{item.text}</Text></View>)}</View>;
  return null;
};

const PDFResume = ({ cv }: { cv: TailoredCV }) => {
  const clean = exportableCV(cv);
  const contact = [clean.contact.email, clean.contact.phone, clean.contact.location, clean.contact.linkedin, clean.contact.website].filter(Boolean);
  const totalExperience = formatExperienceDuration(calculateExperienceMonths(clean));
  return <Document title={`${clean.contact.fullName} CV`} author={clean.contact.fullName}><Page size="A4" style={[styles.page, clean.templateId === "compact" ? styles.compact : {}]}>
    <View style={styles.header}><View style={styles.identity}><Text style={styles.name}>{clean.contact.fullName}</Text>{clean.contact.headline && <Text style={styles.headline}>{clean.contact.headline}</Text>}<View style={styles.contact}>{contact.map((item) => <Text key={item}>{item}</Text>)}</View>{totalExperience && <Text style={styles.experienceTotal}>{totalExperience} total experience</Text>}</View>{clean.photo?.visible && <Image style={styles.photo} src={clean.photo.dataUrl} />}</View>
    <View style={styles.rule} />
    {clean.sectionOrder.map((key) => <PDFSection key={key} cv={clean} sectionKey={key} />)}
  </Page></Document>;
};

const withCroppedPhoto = async (cv: TailoredCV): Promise<TailoredCV> => cv.photo?.visible
  ? { ...cv, photo: { ...cv.photo, dataUrl: await cropProfilePhoto(cv.photo) } }
  : cv;

export const exportPDF = async (cv: TailoredCV) => saveBlob(await pdf(<PDFResume cv={await withCroppedPhoto(cv)} />).toBlob(), `${cv.contact.fullName || "CV"}.pdf`);

const dataUrlBytes = (dataUrl: string) => {
  const encoded = dataUrl.split(",")[1] ?? "";
  return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
};

export const exportDOCX = async (cv: TailoredCV) => {
  const clean = exportableCV(await withCroppedPhoto(cv));
  const totalExperience = formatExperienceDuration(calculateExperienceMonths(clean));
  const heading = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 80 }, border: { bottom: { color: "AAC0BC", size: 4, style: "single", space: 4 } } });
  const children: Paragraph[] = [];
  if (clean.photo?.visible) children.push(new Paragraph({ children: [new ImageRun({ data: dataUrlBytes(clean.photo.dataUrl), transformation: { width: 72, height: 72 }, type: "jpg", altText: { title: "Profile photo", description: `${clean.contact.fullName} profile photo`, name: "Profile photo" } })], spacing: { after: 80 } }));
  children.push(
    new Paragraph({ children: [new TextRun({ text: clean.contact.fullName, bold: true, size: 36, color: "163F3B" })] }),
    new Paragraph({ children: [new TextRun({ text: clean.contact.headline, size: 22, color: "426460" })], spacing: { after: 80 } }),
    new Paragraph({ text: [clean.contact.email, clean.contact.phone, clean.contact.location, clean.contact.linkedin, clean.contact.website].filter(Boolean).join("  |  "), spacing: { after: 180 } }),
    ...(totalExperience ? [new Paragraph({ children: [new TextRun({ text: `${totalExperience} total experience`, bold: true, color: "356C65", size: 17 })], spacing: { after: 100 } })] : []),
  );
  const addSection = (key: string) => {
    if (key === "summary" && clean.summary.visible && clean.summary.text) children.push(heading("PROFILE"), new Paragraph(clean.summary.text));
    if (key === "experience" && clean.experience.some((item) => item.visible)) {
      children.push(heading("EXPERIENCE"));
      clean.experience.filter((item) => item.visible).forEach((item) => {
        children.push(new Paragraph({ children: [new TextRun({ text: item.role, bold: true }), new TextRun({ text: ` · ${item.company}`, color: "426460" }), new TextRun({ text: `    ${dateRange(item.startDate, item.endDate)}`, color: "5B6866" })], spacing: { before: 100 } }));
        if (item.location) children.push(new Paragraph({ children: [new TextRun({ text: item.location, italics: true, color: "5B6866" })] }));
        item.bullets.filter((bullet) => bullet.visible && bullet.text).forEach((bullet) => children.push(new Paragraph({ text: bullet.text, bullet: { level: 0 } })));
      });
    }
    if (key === "skills" && clean.skills.some((item) => item.visible && item.text)) children.push(heading("CORE SKILLS"), new Paragraph(clean.skills.filter((item) => item.visible && item.text).map((item) => item.text).join("  •  ")));
    if (key === "education" && clean.education.some((item) => item.visible)) {
      children.push(heading("EDUCATION"));
      clean.education.filter((item) => item.visible).forEach((item) => children.push(new Paragraph({ children: [new TextRun({ text: item.qualification, bold: true }), new TextRun({ text: ` · ${item.institution}` }), new TextRun({ text: `    ${dateRange(item.startDate, item.endDate)}`, color: "5B6866" })] }), ...(item.details ? [new Paragraph(item.details)] : [])));
    }
    if (key === "projects" && clean.projects.some((item) => item.visible)) {
      children.push(heading("SELECTED PROJECTS"));
      clean.projects.filter((item) => item.visible).forEach((item) => children.push(new Paragraph({ children: [new TextRun({ text: item.name, bold: true })], spacing: { before: 80 } }), ...(item.description ? [new Paragraph(item.description)] : []), ...(item.link ? [new Paragraph(item.link)] : [])));
    }
    if (key === "certifications" && clean.certifications.some((item) => item.visible)) children.push(heading("CERTIFICATIONS"), ...clean.certifications.filter((item) => item.visible).map((item) => new Paragraph({ children: [new TextRun({ text: item.name, bold: true }), new TextRun({ text: item.detail ? ` · ${item.detail}` : "" })] })));
    if (key === "languages" && clean.languages.some((item) => item.visible)) children.push(heading("LANGUAGES"), new Paragraph(clean.languages.filter((item) => item.visible).map((item) => `${item.name}${item.detail ? ` (${item.detail})` : ""}`).join("  •  ")));
    const custom = clean.customSections.find((item) => item.id === key);
    if (custom?.visible && custom.items.some((item) => item.visible && item.text)) children.push(heading(custom.title.toUpperCase()), ...custom.items.filter((item) => item.visible && item.text).map((item) => new Paragraph({ text: item.text, bullet: { level: 0 } })));
  };
  clean.sectionOrder.forEach(addSection);
  const document = new DocxDocument({ styles: { paragraphStyles: [{ id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { bold: true, color: "163F3B", size: 18, characterSpacing: 18 }, paragraph: { spacing: { before: 220, after: 80 } } }] }, sections: [{ properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children }] });
  saveBlob(await Packer.toBlob(document), `${clean.contact.fullName || "CV"}.docx`);
};
