import React, { type ReactNode } from "react";
import { AlignmentType, Document as DocxDocument, Header, HeadingLevel, ImageRun, PageNumber, Packer, Paragraph, TextRun } from "docx";
import { Document, Image, Link, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import {
  calculateExperienceMonths, calculateRoleExperienceMonths, exportableCV, formatExperienceDate, formatExperienceDuration,
  type TailoredCV,
} from "@cv-maker/shared";
import { cropProfilePhoto } from "./photo";

const saveBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

const styles = StyleSheet.create({
  page: { padding: 42, fontFamily: "Helvetica", color: "#1f2927", fontSize: 9.5, lineHeight: 1.45 },
  compact: { padding: 32, paddingTop: 38, fontSize: 8.8, lineHeight: 1.36 },
  header: { flexDirection: "column" },
  identity: { flexGrow: 1 },
  photo: { width: 62, height: 62, objectFit: "cover", borderRadius: 6, marginTop: 4, marginBottom: 7 },
  nameBlock: { minHeight: 31, paddingBottom: 3 },
  name: { fontFamily: "Helvetica-Bold", fontSize: 25, color: "#163f3b" },
  headline: { fontSize: 11, color: "#426460", marginBottom: 5 },
  contact: { color: "#4c5856", fontSize: 8 },
  contactRow: { marginBottom: 1 },
  experienceTotal: { marginTop: 6, color: "#356c65", fontSize: 8, fontFamily: "Helvetica-Bold" },
  rule: { height: 2, backgroundColor: "#163f3b", marginTop: 13, marginBottom: 4 },
  continuationHeader: { position: "absolute", top: 13, left: 42, right: 42, flexDirection: "row", justifyContent: "space-between", color: "#4c5856", fontSize: 7.5 },
  continuationName: { fontFamily: "Helvetica-Bold", color: "#163f3b" },
  section: { marginTop: 11 },
  heading: { fontFamily: "Helvetica-Bold", fontSize: 9, letterSpacing: 1.25, textTransform: "uppercase", color: "#163f3b", borderBottomWidth: 0.6, borderBottomColor: "#aac0bc", paddingBottom: 3, marginBottom: 6 },
  entry: { marginBottom: 5 },
  entryHeader: { marginTop: 2, marginBottom: 1 },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: "#5b6866", fontSize: 8.3 },
  dateInfo: { flexDirection: "row", gap: 5, marginTop: 1 },
  roleDuration: { color: "#356c65", fontSize: 7.4, fontFamily: "Helvetica-Bold" },
  bullet: { flexDirection: "row", marginTop: 2 },
  dot: { width: 10 },
  body: { flex: 1 },
  listRow: { flexDirection: "row", gap: 5, marginBottom: 2 },
  link: { color: "#356c65", fontSize: 8.2, marginTop: 2 },
});

const dateRange = (start: string, end: string) => [formatExperienceDate(start, "start"), formatExperienceDate(end, "end")].filter(Boolean).join(" – ");

const contactRows = (cv: TailoredCV) => [
  ["Email", cv.contact.email],
  ["Phone", cv.contact.phone],
  ["Location", cv.contact.location],
  ["LinkedIn", cv.contact.linkedin],
  ["Website", cv.contact.website],
].filter((item): item is [string, string] => Boolean(item[1]));

const PDFBullet = ({ bullet }: { bullet: TailoredCV["experience"][number]["bullets"][number] }) => <View style={styles.bullet} wrap={false}><Text style={styles.dot}>•</Text><Text style={styles.body}>{bullet.text}</Text></View>;

const PDFExperienceEntry = ({ item }: { item: TailoredCV["experience"][number] }) => {
  const duration = formatExperienceDuration(calculateRoleExperienceMonths(item));
  const bullets = item.bullets.filter((bullet) => bullet.visible && bullet.text);
  const header = <View style={styles.entryHeader}><Text style={styles.bold}>{item.role}</Text><Text style={styles.muted}>{item.company}{item.location ? ` · ${item.location}` : ""}</Text><View style={styles.dateInfo}><Text style={styles.muted}>{dateRange(item.startDate, item.endDate)}</Text>{duration && <Text style={styles.roleDuration}>· {duration}</Text>}</View></View>;
  return <View style={styles.entry}>{bullets[0] ? <View wrap={false}>{header}<PDFBullet bullet={bullets[0]} /></View> : <View wrap={false}>{header}</View>}{bullets.slice(1).map((bullet) => <PDFBullet bullet={bullet} key={bullet.id} />)}</View>;
};

const PDFSection = ({ cv, sectionKey }: { cv: TailoredCV; sectionKey: string }): ReactNode => {
  if (sectionKey === "summary" && cv.summary.visible && cv.summary.text) return <View style={styles.section}><Text style={styles.heading} minPresenceAhead={35}>Profile</Text><Text orphans={2} widows={2}>{cv.summary.text}</Text></View>;
  if (sectionKey === "experience" && cv.experience.some((item) => item.visible)) return <View style={styles.section}><Text style={styles.heading} minPresenceAhead={70}>Experience</Text>{cv.experience.filter((item) => item.visible).map((item) => <PDFExperienceEntry item={item} key={item.id} />)}</View>;
  if (sectionKey === "skills" && cv.skills.some((item) => item.visible && item.text)) return <View style={styles.section}><Text style={styles.heading} minPresenceAhead={30}>Core skills</Text><Text>{cv.skills.filter((item) => item.visible && item.text).map((item) => item.text).join(", ")}</Text></View>;
  if (sectionKey === "education" && cv.education.some((item) => item.visible)) return <View style={styles.section}><Text style={styles.heading} minPresenceAhead={45}>Education</Text>{cv.education.filter((item) => item.visible).map((item) => <View key={item.id} style={styles.entry} wrap={false}><View style={styles.entryHeader}><Text style={styles.bold}>{item.qualification}</Text><Text style={styles.muted}>{item.institution}</Text><Text style={styles.muted}>{dateRange(item.startDate, item.endDate)}</Text></View>{item.details && <Text>{item.details}</Text>}</View>)}</View>;
  if (sectionKey === "projects" && cv.projects.some((item) => item.visible)) return <View style={styles.section}><Text style={styles.heading} minPresenceAhead={45}>Selected projects</Text>{cv.projects.filter((item) => item.visible).map((item) => <View key={item.id} style={styles.entry} wrap={false}><Text style={styles.bold}>{item.name}</Text>{item.description && <Text>{item.description}</Text>}{item.link && <Link style={styles.link} src={item.link}>{item.link}</Link>}</View>)}</View>;
  if (sectionKey === "certifications" && cv.certifications.some((item) => item.visible)) return <View style={styles.section}><Text style={styles.heading} minPresenceAhead={30}>Certifications</Text>{cv.certifications.filter((item) => item.visible).map((item) => <View style={styles.listRow} key={item.id} wrap={false}><Text style={styles.bold}>{item.name}</Text>{item.detail && <Text style={styles.muted}>· {item.detail}</Text>}</View>)}</View>;
  if (sectionKey === "languages" && cv.languages.some((item) => item.visible)) return <View style={styles.section}><Text style={styles.heading} minPresenceAhead={30}>Languages</Text>{cv.languages.filter((item) => item.visible).map((item) => <View style={styles.listRow} key={item.id} wrap={false}><Text style={styles.bold}>{item.name}</Text>{item.detail && <Text style={styles.muted}>· {item.detail}</Text>}</View>)}</View>;
  const custom = cv.customSections.find((item) => item.id === sectionKey);
  if (custom?.visible && custom.items.some((item) => item.visible && item.text)) return <View style={styles.section}><Text style={styles.heading} minPresenceAhead={35}>{custom.title}</Text>{custom.items.filter((item) => item.visible && item.text).map((item) => <View style={styles.bullet} key={item.id} wrap={false}><Text style={styles.dot}>•</Text><Text style={styles.body}>{item.text}</Text></View>)}</View>;
  return null;
};

const PDFResume = ({ cv }: { cv: TailoredCV }) => {
  const clean = exportableCV(cv);
  const contact = contactRows(clean);
  const totalExperience = formatExperienceDuration(calculateExperienceMonths(clean));
  return <Document title={`${clean.contact.fullName} CV`} author={clean.contact.fullName}><Page size="A4" style={[styles.page, clean.templateId === "compact" ? styles.compact : {}]}>
    <View fixed style={styles.continuationHeader} render={({ pageNumber }) => pageNumber > 1 ? <><Text style={styles.continuationName}>{clean.contact.fullName}{clean.contact.headline ? ` · ${clean.contact.headline}` : ""}</Text><Text>{`CV continuation · Page ${pageNumber}`}</Text></> : null} />
    <View style={styles.header}><View style={styles.identity}><View style={styles.nameBlock}><Text style={styles.name}>{clean.contact.fullName}</Text></View>{clean.contact.headline && <Text style={styles.headline}>{clean.contact.headline}</Text>}{clean.photo?.visible && <Image style={styles.photo} src={clean.photo.dataUrl} />}<View style={styles.contact}>{contact.map(([label, value]) => <Text style={styles.contactRow} key={label}>{`${label}: ${value}`}</Text>)}</View>{totalExperience && <Text style={styles.experienceTotal}>{totalExperience} total experience</Text>}</View></View>
    <View style={styles.rule} />
    {clean.sectionOrder.map((key) => <PDFSection key={key} cv={clean} sectionKey={key} />)}
  </Page></Document>;
};

const withCroppedPhoto = async (cv: TailoredCV): Promise<TailoredCV> => cv.photo?.visible
  ? { ...cv, photo: { ...cv.photo, dataUrl: await cropProfilePhoto(cv.photo) } }
  : cv;

export const renderPDFBlob = async (cv: TailoredCV) => pdf(<PDFResume cv={await withCroppedPhoto(cv)} />).toBlob();

export const exportPDF = async (cv: TailoredCV) => saveBlob(await renderPDFBlob(cv), `${cv.contact.fullName || "CV"}.pdf`);

const dataUrlBytes = (dataUrl: string) => {
  const encoded = dataUrl.split(",")[1] ?? "";
  return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
};

export const renderDOCXBlob = async (cv: TailoredCV) => {
  const clean = exportableCV(await withCroppedPhoto(cv));
  const totalExperience = formatExperienceDuration(calculateExperienceMonths(clean));
  const heading = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, keepNext: true, spacing: { before: 220, after: 80 }, border: { bottom: { color: "AAC0BC", size: 4, style: "single", space: 4 } } });
  const children: Paragraph[] = [];
  children.push(
    new Paragraph({ children: [new TextRun({ text: clean.contact.fullName, bold: true, size: 36, color: "163F3B" })], keepNext: true }),
    new Paragraph({ children: [new TextRun({ text: clean.contact.headline, size: 22, color: "426460" })], keepNext: true, spacing: { after: 80 } }),
    ...(clean.photo?.visible ? [new Paragraph({ children: [new ImageRun({ data: dataUrlBytes(clean.photo.dataUrl), transformation: { width: 62, height: 62 }, type: "jpg", altText: { title: "Profile photo", description: `${clean.contact.fullName} profile photo`, name: "Profile photo" } })], keepNext: true, spacing: { after: 80 } })] : []),
    ...contactRows(clean).map(([label, value], index, rows) => new Paragraph({ children: [new TextRun({ text: `${label}: `, bold: true, color: "344441" }), new TextRun({ text: value, color: "4C5856" })], keepNext: index < rows.length - 1 || Boolean(totalExperience), spacing: { after: 20 } })),
    ...(totalExperience ? [new Paragraph({ children: [new TextRun({ text: `${totalExperience} total experience`, bold: true, color: "356C65", size: 17 })], spacing: { after: 100 } })] : []),
  );
  const addSection = (key: string) => {
    if (key === "summary" && clean.summary.visible && clean.summary.text) children.push(heading("PROFILE"), new Paragraph(clean.summary.text));
    if (key === "experience" && clean.experience.some((item) => item.visible)) {
      children.push(heading("EXPERIENCE"));
      clean.experience.filter((item) => item.visible).forEach((item) => {
        const duration = formatExperienceDuration(calculateRoleExperienceMonths(item));
        const bullets = item.bullets.filter((bullet) => bullet.visible && bullet.text);
        children.push(new Paragraph({ children: [new TextRun({ text: item.role, bold: true })], keepNext: true, spacing: { before: 100 } }));
        children.push(new Paragraph({ children: [new TextRun({ text: item.company, color: "426460" }), ...(item.location ? [new TextRun({ text: ` · ${item.location}`, color: "5B6866" })] : [])], keepNext: true }));
        children.push(new Paragraph({ children: [new TextRun({ text: dateRange(item.startDate, item.endDate), color: "5B6866" }), ...(duration ? [new TextRun({ text: ` · ${duration}`, bold: true, color: "356C65" })] : [])], keepNext: bullets.length > 0 }));
        bullets.forEach((bullet) => children.push(new Paragraph({ text: bullet.text, bullet: { level: 0 }, keepLines: true, widowControl: true })));
      });
    }
    if (key === "skills" && clean.skills.some((item) => item.visible && item.text)) children.push(heading("CORE SKILLS"), new Paragraph(clean.skills.filter((item) => item.visible && item.text).map((item) => item.text).join(", ")));
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
  const continuationHeader = new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${clean.contact.fullName}${clean.contact.headline ? ` | ${clean.contact.headline}` : ""} | CV continuation | Page `, bold: true, color: "344441", size: 16 }), new TextRun({ children: [PageNumber.CURRENT] })], border: { bottom: { color: "AAC0BC", size: 4, style: "single", space: 4 } }, spacing: { after: 60 } })] });
  const document = new DocxDocument({ styles: { paragraphStyles: [{ id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { bold: true, color: "163F3B", size: 18, characterSpacing: 18 }, paragraph: { keepNext: true, spacing: { before: 220, after: 80 } } }] }, sections: [{ properties: { titlePage: true, page: { margin: { top: 720, right: 720, bottom: 720, left: 720, header: 260 } } }, headers: { default: continuationHeader, first: new Header({ children: [new Paragraph("")] }) }, children }] });
  return Packer.toBlob(document);
};

export const exportDOCX = async (cv: TailoredCV) => saveBlob(await renderDOCXBlob(cv), `${cv.contact.fullName || "CV"}.docx`);
