import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateRawSync } from "node:zlib";

const repositoryRoot = process.cwd();
const extensionDirectory = path.join(repositoryRoot, "apps", "extension", "dist");
const outputPath = path.join(repositoryRoot, "apps", "web", "public", "downloads", "cv-maker-extension.zip");

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

const crc32 = (data) => {
  let value = 0xffffffff;
  for (const byte of data) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

const walk = async (directory, prefix = "") => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const archiveName = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await walk(path.join(directory, entry.name), archiveName));
    else files.push({ name: archiveName, data: await readFile(path.join(directory, entry.name)) });
  }
  return files;
};

const createZip = (files) => {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name.replaceAll("\\", "/"));
    const compressed = deflateRawSync(file.data, { level: 9 });
    const checksum = crc32(file.data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(33, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(file.data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(33, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(file.data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
};

const files = await walk(extensionDirectory);
const manifestFile = files.find((file) => file.name === "manifest.json");
if (!manifestFile) throw new Error("The extension build is missing manifest.json.");

const manifest = JSON.parse(manifestFile.data.toString("utf8"));
const bundleText = files.filter((file) => file.name.endsWith(".js")).map((file) => file.data.toString("utf8")).join("\n");
if (manifest.host_permissions?.some((permission) => permission.includes("your-project")) || !bundleText.includes("https://cvtailor.pages.dev")) {
  throw new Error("Refusing to package an extension without production Supabase and web app settings.");
}

files.push({
  name: "INSTALL.txt",
  data: Buffer.from([
    "CV Maker browser extension",
    "",
    "1. Extract this ZIP to a permanent folder.",
    "2. Open chrome://extensions in Chrome.",
    "3. Enable Developer mode.",
    "4. Choose Load unpacked and select the extracted folder.",
    "5. Open the extension and sign in with your CV Maker account.",
    "",
    "Keep the extracted folder in place while the extension is installed.",
  ].join("\r\n")),
});

await mkdir(path.dirname(outputPath), { recursive: true });
const archive = createZip(files);
await writeFile(outputPath, archive);
console.log(`Packaged ${files.length} extension files to ${path.relative(repositoryRoot, outputPath)} (${archive.length} bytes).`);
