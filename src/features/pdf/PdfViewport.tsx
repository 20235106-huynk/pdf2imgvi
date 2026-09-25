import type { Dispatch, RefObject, SetStateAction } from "react"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { FileText, X, ChevronLeft, ChevronRight, Sparkles, Columns, Layers, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"

type ViewMode = "original" | "translated" | "sideBySide"

interface Props {
  pdf: PDFDocumentProxy
  fileName: string
  fileSize: number
  pageNumber: number
  viewMode: ViewMode
  rendering: boolean
  loadingTranslatedImage: boolean
  translatedImageUrl: string | null
  translationRunning: boolean
  canvasRef: RefObject<HTMLCanvasElement | null>
  sideCanvasRef: RefObject<HTMLCanvasElement | null>
  setViewMode: Dispatch<SetStateAction<ViewMode>>
  setPageNumber: Dispatch<SetStateAction<number>>
  removeFile: () => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function PdfViewport({ pdf, fileName, fileSize, pageNumber, viewMode, rendering, loadingTranslatedImage, translatedImageUrl, translationRunning, canvasRef, sideCanvasRef, setViewMode, setPageNumber, removeFile }: Props) {
  const { t } = useI18n()
  return (
            <div className="flex flex-col rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
              {/* Viewport Sticky Top Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-muted/40 p-3 sm:px-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold" title={fileName}>
                      {fileName}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{formatFileSize(fileSize)}</span>
                      <span>•</span>
                      <span>
                        {pdf.numPages} {pdf.numPages === 1 ? "page" : "pages"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* View Mode Switcher */}
                  <div className="flex items-center rounded-lg border border-border bg-background p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setViewMode("original")}
                      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                        viewMode === "original"
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      title={t("viewOriginal")}
                    >
                      <Layers className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{t("viewOriginal")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("translated")}
                      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                        viewMode === "translated"
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      title={t("viewTranslated")}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{t("viewTranslated")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("sideBySide")}
                      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                        viewMode === "sideBySide"
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      title={t("viewSideBySide")}
                    >
                      <Columns className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{t("viewSideBySide")}</span>
                    </button>
                  </div>

                  {/* Change / Remove File */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={translationRunning}
                    onClick={removeFile}
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                    title={t("removePdf")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Viewport Canvas Stage */}
              <div className="relative flex min-h-[500px] flex-col items-center justify-center overflow-auto p-4 sm:p-6 bg-muted/20">
                {rendering && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-xs">
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-md">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>{t("renderingPage")}</span>
                    </div>
                  </div>
                )}

                {/* View Modes */}
                {viewMode === "original" && (
                  <div className="flex aspect-[210/297] w-full max-w-[900px] items-center justify-center bg-white shadow-md">
                    <canvas
                      ref={canvasRef}
                      role="img"
                      aria-label={`Preview of page ${pageNumber} of ${pdf.numPages}`}
                      className="h-full w-full border border-border/80 bg-white object-contain"
                    />
                  </div>
                )}

                {viewMode === "translated" && (
                  <div className="flex aspect-[210/297] w-full max-w-[900px] flex-col items-center justify-center bg-white shadow-md">
                    {loadingTranslatedImage ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span>Đang tải trang dịch…</span>
                      </div>
                    ) : translatedImageUrl ? (
                      <img
                        src={translatedImageUrl}
                        alt={`Translated page ${pageNumber} of ${pdf.numPages}`}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 p-8 text-center max-w-sm">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
                          <Sparkles className="h-6 w-6" />
                        </div>
                        <p className="font-semibold text-sm">{t("noTranslationYet")}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{t("clickToTranslate")}</p>
                      </div>
                    )}
                  </div>
                )}

                {viewMode === "sideBySide" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                    {/* Left: Original Page */}
                    <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-xs">
                      <div className="flex items-center gap-1.5 self-start px-1 text-xs font-semibold text-muted-foreground">
                        <Layers className="h-3.5 w-3.5" />
                        <span>{t("originalDoc")}</span>
                      </div>
                      <div className="flex aspect-[210/297] w-full items-center justify-center overflow-hidden bg-white">
                        <canvas
                          ref={sideCanvasRef}
                          role="img"
                          aria-label={`Preview of page ${pageNumber} of ${pdf.numPages}`}
                          className="h-full w-full border border-border bg-white object-contain"
                        />
                      </div>
                    </div>

                    {/* Right: Translated Page */}
                    <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-xs">
                      <div className="flex items-center gap-1.5 self-start px-1 text-xs font-semibold text-primary">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>{t("translatedDoc")}</span>
                      </div>
                      <div className="flex aspect-[210/297] w-full flex-col items-center justify-center bg-white">
                        {loadingTranslatedImage ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                            <span>Đang tải…</span>
                          </div>
                        ) : translatedImageUrl ? (
                          <img
                            src={translatedImageUrl}
                            alt={`Translated page ${pageNumber}`}
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center p-6 text-center">
                            <p className="text-xs font-medium text-muted-foreground">
                              {t("noTranslationYet")}
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground/80">
                              {t("clickToTranslate")}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Viewport Footer Pagination */}
              <div className="flex items-center justify-between border-t border-border/80 bg-card px-4 py-2.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={rendering || pageNumber === 1}
                  onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                  className="gap-1.5 text-xs h-8 cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>{t("prevPage")}</span>
                </Button>

                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="text-muted-foreground">{t("jumpToPage")}</span>
                  <input
                    type="number"
                    min={1}
                    max={pdf.numPages}
                    value={pageNumber}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10)
                      if (!isNaN(val) && val >= 1 && val <= pdf.numPages) {
                        setPageNumber(val)
                      }
                    }}
                    className="h-7 w-12 rounded border border-input bg-background text-center text-xs font-semibold outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <span className="text-muted-foreground">/ {pdf.numPages}</span>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={rendering || pageNumber === pdf.numPages}
                  onClick={() => setPageNumber((p) => Math.min(pdf.numPages, p + 1))}
                  className="gap-1.5 text-xs h-8 cursor-pointer"
                >
                  <span>{t("nextPage")}</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
  )
}
