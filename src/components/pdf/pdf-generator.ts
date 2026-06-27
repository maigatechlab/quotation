type RestoreStyle = () => void;

const A4_HEIGHT_MM = 297;
const A4_WIDTH_MM = 210;
const PAGE_BREAK_BUFFER_PX = 8;

function prepareAvoidBreakElements(root: HTMLElement): RestoreStyle[] {
  const pageHeightPx = root.clientWidth * (A4_HEIGHT_MM / A4_WIDTH_MM);
  if (!Number.isFinite(pageHeightPx) || pageHeightPx <= 0) return [];

  const restoreFns: RestoreStyle[] = [];
  const avoidBreakElements = Array.from(
    root.querySelectorAll<HTMLElement>("[data-pdf-avoid-break='true']")
  );

  for (const element of avoidBreakElements) {
    const rect = element.getBoundingClientRect();
    if (rect.height >= pageHeightPx) continue;

    const rootRect = root.getBoundingClientRect();
    const top = rect.top - rootRect.top + root.scrollTop;
    const pageOffset = top % pageHeightPx;

    if (pageOffset + rect.height <= pageHeightPx) continue;

    const currentMarginTop = Number.parseFloat(element.style.marginTop || "0") || 0;
    const addedMargin = pageHeightPx - pageOffset + PAGE_BREAK_BUFFER_PX;
    const previousMarginTop = element.style.marginTop;

    element.style.marginTop = `${currentMarginTop + addedMargin}px`;
    restoreFns.push(() => {
      element.style.marginTop = previousMarginTop;
    });
  }

  return restoreFns;
}
export async function generateQuotePdf(
  containerId: string,
  filename: string
): Promise<void> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const element = document.getElementById(containerId);
  if (!element) throw new Error("PDF template container not found");

  const restoreStyles = prepareAvoidBreakElements(element);

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });
  } finally {
    for (const restore of restoreStyles) restore();
  }

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

  pdf.save(filename);
}
