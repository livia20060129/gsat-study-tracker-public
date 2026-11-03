import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

/** Decode the embedded font's ToUnicode map, so assertions check actual PDF text. */
export async function inspectVocabularyPdf(bytes: Uint8Array): Promise<{ text: string; pageTexts: string[]; sizes: { width: number; height: number }[] }> {
  const document = await PDFDocument.load(bytes);
  const glyphs = new Map<string, string>();
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue;
    const unicode = object.lookup(PDFName.of('ToUnicode'));
    if (!(unicode instanceof PDFRawStream)) continue;
    const cmap = Buffer.from(decodePDFRawStream(unicode).decode()).toString('utf8');
    for (const section of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const match of section[1].matchAll(/<([a-f\d]+)>\s*<([a-f\d]+)>/gi)) {
        const value = (match[2].match(/.{4}/g) ?? []).map(code => String.fromCharCode(parseInt(code, 16))).join('');
        glyphs.set(match[1].toUpperCase(), value);
      }
    }
  }
  const pages = document.getPages();
  const pageTexts = pages.map(page => {
    const contents = page.node.Contents();
    const streams: PDFRawStream[] = [];
    if (contents instanceof PDFArray) {
      for (let index = 0; index < contents.size(); index += 1) streams.push(contents.lookup(index, PDFRawStream));
    } else if (contents instanceof PDFRawStream) streams.push(contents);
    return streams.flatMap(stream => {
      const commands = Buffer.from(decodePDFRawStream(stream).decode()).toString('utf8');
      return [...commands.matchAll(/<([A-F\d]+)>\s*Tj/gi)].map(match => (
        (match[1].match(/.{4}/g) ?? []).map(code => glyphs.get(code.toUpperCase()) ?? '').join('')
      ));
    }).join('\n');
  });
  return { text: pageTexts.join('\n'), pageTexts, sizes: pages.map(page => page.getSize()) };
}
