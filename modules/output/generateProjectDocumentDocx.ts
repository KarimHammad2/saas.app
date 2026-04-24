import { Document, Packer, Paragraph, TextRun } from "docx";

export async function generateProjectDocumentDocx(markdown: string): Promise<Buffer> {
  const lines = markdown.split("\n");
  const paragraphs = lines.map(
    (line) => new Paragraph({ children: [new TextRun({ text: line })] }),
  );
  const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
  return Packer.toBuffer(doc);
}
