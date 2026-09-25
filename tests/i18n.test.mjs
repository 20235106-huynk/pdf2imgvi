import assert from "node:assert/strict"
import test from "node:test"
import { t, setLanguage, getLanguage } from "../src/lib/i18n.ts"

test("i18n provides Vietnamese and English translations", () => {
  setLanguage("vi")
  assert.equal(getLanguage(), "vi")
  assert.equal(t("appTitle"), "pdf2imgvi")
  assert.equal(t("choosePdf"), "Chọn tệp PDF")
  assert.equal(t("startTranslation"), "Bắt đầu dịch sang Tiếng Việt")

  setLanguage("en")
  assert.equal(getLanguage(), "en")
  assert.equal(t("choosePdf"), "Choose PDF")
  assert.equal(t("startTranslation"), "Start Translation")
})

test("i18n interpolation works correctly", () => {
  setLanguage("vi")
  assert.equal(t("pageCount", { current: 1, total: 10 }), "Trang 1 / 10")

  setLanguage("en")
  assert.equal(t("pageCount", { current: 1, total: 10 }), "Page 1 of 10")
})
