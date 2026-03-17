import jsPDF from "jspdf";
import { ParsedBlock, TitlePageData } from "../types";
import { paginateBlocks } from "./pagination";

interface ExportOptions {
  title: string;
  blocks: ParsedBlock[];
  showTitlePage: boolean;
  titlePage: TitlePageData | null;
}

export function exportToTxt({ title, blocks, showTitlePage, titlePage }: ExportOptions) {
  const PAGE_WIDTH = 60;
  const DIALOGUE_INDENT = 15;
  const DIALOGUE_WIDTH = 35;

  const wrapText = (text: string, maxWidth: number, indent: number): string => {
    const pad = " ".repeat(indent);
    const words = text.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      if (line.length + (line ? 1 : 0) + word.length <= maxWidth) {
        line += (line ? " " : "") + word;
      } else {
        if (line) lines.push(pad + line);
        line = word;
      }
    }
    if (line) lines.push(pad + line);
    return lines.join("\n");
  };

  const center = (text: string): string => {
    const pad = Math.max(0, Math.floor((PAGE_WIDTH - text.length) / 2));
    return " ".repeat(pad) + text;
  };

  let output = "";

  // Title page (only if user created one)
  if (showTitlePage && titlePage) {
    const TITLE_LINES_TOP = 22;
    output += "\n".repeat(TITLE_LINES_TOP);
    output += center(titlePage.title.toUpperCase()) + "\n";
    if (titlePage.subtitle) output += center(titlePage.subtitle) + "\n";
    output += "\n" + center("Written by") + "\n";
    if (titlePage.author) output += center(titlePage.author) + "\n";
    const TITLE_LINES_BOTTOM = 22;
    output += "\n".repeat(TITLE_LINES_BOTTOM);
    if (titlePage.agencyName) output += titlePage.agencyName + "\n";
    if (titlePage.agencyAddress) output += titlePage.agencyAddress + "\n";
    output += "\f";
  }

  blocks.forEach(b => {
    if (b.type === "act_header") {
      output += center(String(b.parsed).toUpperCase()) + "\n\n";
    } else if (b.type === "scene_heading") {
      output += String(b.parsed).toUpperCase() + "\n\n";
    } else if (b.type === "transition") {
      output += String(b.parsed).toUpperCase().padStart(PAGE_WIDTH) + "\n\n";
    } else if (b.type === "dialogue_block") {
      output += center(String(b.parsed.speaker).toUpperCase()) + "\n";
      if (b.parsed.parenthetical) {
        output += center(`(${b.parsed.parenthetical})`) + "\n";
      }
      output += wrapText(String(b.parsed.dialogue), DIALOGUE_WIDTH, DIALOGUE_INDENT) + "\n\n";
    } else if (b.type === "action") {
      output += wrapText(String(b.parsed), PAGE_WIDTH, 0) + "\n\n";
    }
  });

  const blob = new Blob([output], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title || "script"}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToPdf({ title, blocks, showTitlePage, titlePage }: ExportOptions) {
  try {
    const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
    const pageWidth = 612;
    const pageHeight = 792;
    const leftMargin = 108;
    const rightMargin = 72;
    const usableWidth = pageWidth - leftMargin - rightMargin;
    const lineHeight = 14;
    const dialogueColWidth = usableWidth * 0.6;
    const dialogueColLeft = leftMargin + (usableWidth - dialogueColWidth) / 2;
    const topMargin = 72;

    const thickText = (text: string, x: number, yPos: number, isBold = false) => {
      if (isBold) {
        doc.text(text, x, yPos);
      } else {
        doc.text(text, x, yPos);
        doc.text(text, x + 0.25, yPos);
      }
    };

    if (showTitlePage && titlePage) {
      doc.setFontSize(12);
      const centerX = (x: number) => pageWidth / 2 - x / 2;
      const titleText = (titlePage.title || "").toUpperCase();
      const titleY = pageHeight / 2 - 40;
      doc.setFont("courier", "bold");
      const titleW = doc.getTextWidth(titleText);
      thickText(titleText, centerX(titleW), titleY, true);
      doc.setLineWidth(0.75);
      doc.line(centerX(titleW), titleY + 2, centerX(titleW) + titleW, titleY + 2);
      let ty = titleY + lineHeight * 2;
      doc.setFont("courier", "normal");
      if (titlePage.subtitle) {
        const sw = doc.getTextWidth(titlePage.subtitle);
        thickText(titlePage.subtitle, centerX(sw), ty);
        ty += lineHeight;
      }
      ty += lineHeight;
      const wbText = "Written by";
      thickText(wbText, centerX(doc.getTextWidth(wbText)), ty);
      ty += lineHeight;
      if (titlePage.author) {
        thickText(titlePage.author, centerX(doc.getTextWidth(titlePage.author)), ty);
      }
      let ay = pageHeight - 108;
      if (titlePage.agencyName) { thickText(titlePage.agencyName, leftMargin, ay); ay += lineHeight; }
      if (titlePage.agencyAddress) { thickText(titlePage.agencyAddress, leftMargin, ay); }
      doc.addPage();
    }

    const pages = paginateBlocks(blocks);
    pages.forEach((page, pageIdx) => {
      let y = topMargin;
      doc.setFont("courier", "normal");
      doc.setFontSize(12);
      thickText(`${page.pageNumber}.`, pageWidth - rightMargin, topMargin - 24);

      page.blocks.forEach(({ block: b }) => {
        if (b.type === "act_header") {
          doc.setFont("courier", "bold");
          doc.setFontSize(12);
          const actText = String(b.parsed).toUpperCase();
          const actX = leftMargin + (usableWidth - doc.getTextWidth(actText)) / 2;
          thickText(actText, actX, y, true);
          doc.setLineWidth(0.75);
          doc.line(actX, y + 2, actX + doc.getTextWidth(actText), y + 2);
          y += lineHeight * 3;
        } else if (b.type === "scene_heading") {
          doc.setFont("courier", "bold");
          doc.setFontSize(12);
          const lines = doc.splitTextToSize(String(b.parsed).toUpperCase(), usableWidth);
          lines.forEach((line: string) => { thickText(line, leftMargin, y, true); y += lineHeight; });
          y += lineHeight;
        } else if (b.type === "transition") {
          doc.setFont("courier", "normal");
          doc.setFontSize(12);
          const text = String(b.parsed).toUpperCase();
          thickText(text, pageWidth - rightMargin - doc.getTextWidth(text), y);
          y += lineHeight * 2;
        } else if (b.type === "dialogue_block") {
          doc.setFont("courier", "normal");
          doc.setFontSize(12);
          const speaker = String(b.parsed.speaker).toUpperCase();
          thickText(speaker, dialogueColLeft + (dialogueColWidth - doc.getTextWidth(speaker)) / 2, y);
          y += lineHeight;
          if (b.parsed.parenthetical) {
            doc.setFont("courier", "italic");
            doc.setFontSize(11);
            const paren = `(${b.parsed.parenthetical})`;
            doc.splitTextToSize(paren, dialogueColWidth).forEach((line: string) => {
              thickText(line, dialogueColLeft + (dialogueColWidth - doc.getTextWidth(line)) / 2, y);
              y += lineHeight;
            });
          }
          doc.setFont("courier", "normal");
          doc.setFontSize(12);
          doc.splitTextToSize(String(b.parsed.dialogue), dialogueColWidth).forEach((line: string) => {
            thickText(line, dialogueColLeft, y);
            y += lineHeight;
          });
          y += lineHeight;
        } else if (b.type === "action") {
          doc.setFont("courier", "normal");
          doc.setFontSize(12);
          doc.splitTextToSize(String(b.parsed), usableWidth).forEach((line: string) => {
            thickText(line, leftMargin, y);
            y += lineHeight;
          });
          y += lineHeight;
        }
      });
      if (pageIdx < pages.length - 1) doc.addPage();
    });
    doc.save(`${title || "script"}.pdf`);
  } catch (err) {
    console.error("Error exporting PDF:", err);
  }
}
