/**
 * pdf-share.ts — Génération Blob PDF et partage/téléchargement
 * Client-side only — browser APIs (navigator.share, URL.createObjectURL)
 */

/**
 * Détecte si le navigateur supporte Web Share API Level 2 (partage de fichiers)
 * IMPORTANT : appeler avec un vrai File object (dummyFile) pour tester canShare()
 */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return false;
  try {
    // Test avec un fichier factice — canShare() vérifie le support réel
    const testFile = new File(["test"], "test.pdf", { type: "application/pdf" });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
}

/**
 * Génère un Blob PDF depuis le conteneur DOM hors-écran
 * (réutilise html2canvas + jsPDF en lazy-load — même pattern que pdf-generator.ts)
 */
export async function generatePdfBlob(containerId: string): Promise<Blob> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const element = document.getElementById(containerId);
  if (!element) throw new Error("PDF template container not found");

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * pageWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;
  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  // Retourner le Blob au lieu de sauvegarder directement
  return pdf.output("blob");
}

/**
 * Télécharge un Blob PDF localement (fallback universel)
 */
export function downloadPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a); // nécessaire sur Firefox
  a.click();
  document.body.removeChild(a);
  // Libérer la mémoire après un court délai
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Partage un PDF via Web Share API Level 2
 * Lève une erreur si l'API n'est pas supportée ou si une erreur survient
 */
export async function sharePdfBlob(
  blob: Blob,
  filename: string,
  title: string
): Promise<void> {
  const file = new File([blob], filename, { type: "application/pdf" });
  await navigator.share({
    files: [file],
    title,
    text: title,
  });
}

/**
 * Détecte la plateforme mobile pour le message guidé de fallback
 */
export function isMobilePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}
